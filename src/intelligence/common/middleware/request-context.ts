import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config/index.js';

export interface RequestContext {
  organizationId: string;
  userId?: string;
  userRole?: string;
  permissions?: string[];
  requestId?: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    context?: RequestContext;
  }
}

export const requestContext = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = String(req.header('authorization') ?? '').trim();
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token) {
    if (!config.auth.jwtAccessSecret) {
      res.status(401).json({
        success: false,
        error: {
          code: 'MISSING_JWT_SECRET',
          message: 'JWT access secret is not configured'
        }
      });
      return;
    }

    try {
      const payload = jwt.verify(token, config.auth.jwtAccessSecret) as any;
      req.context = {
        organizationId: String(payload.org_id ?? ''),
        userId: payload.sub ?? undefined,
        userRole: payload.role ?? undefined,
        permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
        requestId: req.header('x-request-id') || undefined
      };
      return next();
    } catch (error: any) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid access token'
        }
      });
      return;
    }
  }

  const organizationId = req.header('x-organization-id');
  if (!organizationId) {
    res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_ORGANIZATION',
        message: 'x-organization-id header is required'
      }
    });
    return;
  }

  const permissionsHeader = String(req.header('x-user-permissions') ?? '').trim();
  const permissions = permissionsHeader ? permissionsHeader.split(',').map((value) => value.trim()).filter(Boolean) : [];

  req.context = {
    organizationId,
    userId: req.header('x-user-id') || undefined,
    userRole: req.header('x-user-role') || undefined,
    permissions,
    requestId: req.header('x-request-id') || undefined
  };

  next();
};
