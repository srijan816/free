import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { ROLE_PERMISSIONS, UserRole } from '../constants/index.js';
import { ApiError, ERROR_CODES } from '../utils/errors.js';
import { sha256, randomToken } from '../utils/crypto.js';
import { createOrganization } from './organizations.js';
import { createUser, findUserByEmail, findUserById, resetFailedAttempts, updateUser } from './users.js';
import { createSession, findSessionByUserAndToken, revokeAllSessions, revokeSessionByToken, updateSession } from './sessions.js';
import { logAudit } from './audit.js';
import { createNotification } from './notifications.js';
import { db } from '../db/index.js';

export interface JwtPayload {
  sub: string;
  email: string;
  org_id: string;
  role: UserRole;
  permissions: string[];
  jti: string;
  iat: number;
  exp: number;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: 'Bearer';
}

export async function registerUser(dto: {
  email: string;
  name: string;
  password: string;
  business_name?: string;
  currency?: string;
  timezone?: string;
}): Promise<TokenPair> {
  const existingUser = await findUserByEmail(dto.email);
  if (existingUser) {
    throw new ApiError({
      code: ERROR_CODES.CONFLICT,
      message: 'Email already registered',
      statusCode: 409
    });
  }

  const organization = await createOrganization({
    name: dto.business_name || `${dto.name}'s Business`,
    email: dto.email,
    currency: dto.currency,
    timezone: dto.timezone
  });

  if (!organization) {
    throw new ApiError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Failed to create organization',
      statusCode: 500
    });
  }

  const passwordHash = await bcrypt.hash(dto.password, 12);

  const user = await createUser({
    organization_id: organization.id,
    email: dto.email,
    name: dto.name,
    password_hash: passwordHash,
    role: 'owner'
  });

  if (!user) {
    throw new ApiError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Failed to create user',
      statusCode: 500
    });
  }

  await logAudit({
    organization_id: organization.id,
    user_id: user.id,
    action: 'user.registered',
    entity_type: 'user',
    entity_id: user.id
  });

  await createNotification({
    organization_id: organization.id,
    user_id: user.id,
    type: 'welcome',
    title: 'Welcome to Freelancer Financial Suite!',
    message: `Hi ${user.name}, your account is ready. Start by creating your first invoice.`
  });

  return generateTokens(user, organization.id);
}

export async function loginUser(
  dto: { email: string; password: string },
  context: { ip_address?: string; user_agent?: string }
): Promise<TokenPair> {
  const user = await findUserByEmail(dto.email);
  if (!user) {
    throw new ApiError({
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Invalid credentials',
      statusCode: 401
    });
  }

  const isValid = await bcrypt.compare(dto.password, user.password_hash || '');
  if (!isValid) {
    await handleFailedLogin(user, context);
    throw new ApiError({
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Invalid credentials',
      statusCode: 401
    });
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new ApiError({
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Account is temporarily locked',
      statusCode: 401
    });
  }

  if (config.requireEmailVerification && !user.email_verified) {
    throw new ApiError({
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Please verify your email',
      statusCode: 401
    });
  }

  await resetFailedAttempts(user.id);

  const tokens = await generateTokens(user, user.organization_id);

  await createSession({
    user_id: user.id,
    organization_id: user.organization_id,
    refresh_token_hash: sha256(tokens.refresh_token),
    ip_address: context.ip_address,
    user_agent: context.user_agent,
    expires_at: new Date(Date.now() + config.jwtRefreshTtl * 1000)
  });

  await updateUser(user.id, { last_login_at: new Date() });

  await logAudit({
    organization_id: user.organization_id,
    user_id: user.id,
    action: 'user.login',
    entity_type: 'session',
    entity_id: user.id,
    ip_address: context.ip_address,
    user_agent: context.user_agent
  });

  return tokens;
}

export async function refreshTokens(refreshToken: string): Promise<TokenPair> {
  let payload: any;
  try {
    payload = jwt.verify(refreshToken, config.jwtRefreshSecret);
  } catch {
    throw new ApiError({
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Invalid refresh token',
      statusCode: 401
    });
  }

  const session = await findSessionByUserAndToken(payload.sub, sha256(refreshToken));
  if (!session || session.revoked_at) {
    throw new ApiError({
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Invalid refresh token',
      statusCode: 401
    });
  }

  const user = await findUserById(payload.sub);
  if (!user || !user.is_active) {
    throw new ApiError({
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'User not found or inactive',
      statusCode: 401
    });
  }

  const tokens = await generateTokens(user, user.organization_id);

  await updateSession(session.id, {
    refresh_token_hash: sha256(tokens.refresh_token),
    last_used_at: new Date()
  });

  return tokens;
}

export async function logoutUser(userId: string, refreshToken?: string): Promise<void> {
  if (refreshToken) {
    await revokeSessionByToken(userId, sha256(refreshToken));
  } else {
    await revokeAllSessions(userId);
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await findUserByEmail(email);
  if (!user) return;

  const resetToken = randomToken(32);
  const resetHash = sha256(resetToken);

  await updateUser(user.id, {
    password_reset_token_hash: resetHash,
    password_reset_expires_at: new Date(Date.now() + 3600000)
  });

  await createNotification({
    organization_id: user.organization_id,
    user_id: user.id,
    type: 'password_reset',
    title: 'Password Reset Requested',
    message: 'A password reset token was requested for your account.',
    data: { reset_token: resetToken }
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const tokenHash = sha256(token);
  const user = await dbFindUserByResetToken(tokenHash);
  if (!user) {
    throw new ApiError({
      code: ERROR_CODES.INVALID_INPUT,
      message: 'Invalid or expired reset token',
      statusCode: 400
    });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await updateUser(user.id, {
    password_hash: passwordHash,
    password_reset_token_hash: null,
    password_reset_expires_at: null,
    password_changed_at: new Date()
  });

  await revokeAllSessions(user.id);
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, config.jwtAccessSecret) as JwtPayload;
  } catch (error: any) {
    if (error?.name === 'TokenExpiredError') {
      throw new ApiError({
        code: ERROR_CODES.TOKEN_EXPIRED,
        message: 'Access token expired',
        statusCode: 401
      });
    }

    throw new ApiError({
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Invalid access token',
      statusCode: 401
    });
  }
}

async function generateTokens(user: any, organizationId: string): Promise<TokenPair> {
  const permissions = ROLE_PERMISSIONS[user.role as UserRole] || [];

  const payload = {
    sub: user.id,
    email: user.email,
    org_id: organizationId,
    role: user.role,
    permissions,
    jti: crypto.randomUUID()
  };

  const accessToken = jwt.sign(payload, config.jwtAccessSecret, { expiresIn: config.jwtAccessTtl });
  const refreshToken = jwt.sign({ sub: user.id, jti: crypto.randomUUID() }, config.jwtRefreshSecret, {
    expiresIn: config.jwtRefreshTtl
  });

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: config.jwtAccessTtl,
    token_type: 'Bearer'
  };
}

async function handleFailedLogin(user: any, context: { ip_address?: string; user_agent?: string }) {
  const failedAttempts = Number(user.failed_login_attempts || 0) + 1;
  const updateData: Record<string, any> = {
    failed_login_attempts: failedAttempts
  };

  if (failedAttempts >= 5) {
    updateData.locked_until = new Date(Date.now() + 15 * 60 * 1000);
  }

  await updateUser(user.id, updateData);

  await logAudit({
    organization_id: user.organization_id,
    user_id: user.id,
    action: 'user.login_failed',
    entity_type: 'user',
    entity_id: user.id,
    ip_address: context.ip_address,
    user_agent: context.user_agent
  });
}

async function dbFindUserByResetToken(tokenHash: string) {
  return db
    .selectFrom('users')
    .selectAll()
    .where('password_reset_token_hash', '=', tokenHash)
    .where('password_reset_expires_at', '>', new Date())
    .executeTakeFirst();
}
