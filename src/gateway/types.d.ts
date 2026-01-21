import 'fastify';

export interface AuthContext {
  organizationId: string;
  userId: string;
  userRole: string;
  permissions: string[];
  email?: string;
  requestId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext;
    requestId?: string;
  }
}
