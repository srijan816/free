import jwt from 'jsonwebtoken';
import { ApiError, ERROR_CODES } from './errors.js';
import { config } from '../config.js';

export type UserRole = 'owner' | 'admin' | 'member';

export interface AuthContext {
  organizationId: string;
  userId: string;
  userRole: UserRole;
  permissions: string[];
  requestId: string;
}

export function parseAuthHeaders(headers: Record<string, unknown>): AuthContext {
  const authHeader = String(headers['authorization'] ?? headers['Authorization'] ?? '').trim();
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token) {
    if (!config.jwtAccessSecret) {
      throw new ApiError({
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'JWT access secret is not configured',
        statusCode: 401
      });
    }

    try {
      const payload = jwt.verify(token, config.jwtAccessSecret) as any;
      const requestId = String(headers['x-request-id'] ?? '').trim();
      return {
        organizationId: String(payload.org_id ?? ''),
        userId: String(payload.sub ?? ''),
        userRole: String(payload.role ?? '') as UserRole,
        permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
        requestId: requestId || crypto.randomUUID()
      };
    } catch (error: any) {
      throw new ApiError({
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Invalid access token',
        statusCode: 401
      });
    }
  }

  const organizationId = String(headers['x-organization-id'] ?? '').trim();
  const userId = String(headers['x-user-id'] ?? '').trim();
  const userRole = String(headers['x-user-role'] ?? '').trim() as UserRole;
  const requestId = String(headers['x-request-id'] ?? '').trim();
  const permissionsHeader = String(headers['x-user-permissions'] ?? '').trim();
  const permissions = permissionsHeader ? permissionsHeader.split(',').map((value) => value.trim()).filter(Boolean) : [];

  if (!organizationId || !userId || !userRole) {
    throw new ApiError({
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Missing authentication headers',
      statusCode: 401
    });
  }

  return {
    organizationId,
    userId,
    userRole,
    permissions,
    requestId: requestId || crypto.randomUUID()
  };
}

export function getRequestId(headers: Record<string, unknown>) {
  const requestId = String(headers['x-request-id'] ?? '').trim();
  return requestId || crypto.randomUUID();
}
