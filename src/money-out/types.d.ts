import 'fastify';
import type { AuthContext } from './utils/auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext;
  }
}
