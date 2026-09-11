import { PrismaClient } from '@prisma/client';
import { validateRuntimeEnv } from './runtime-env';

validateRuntimeEnv();

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Ensure a single PrismaClient instance across the entire Node.js process to prevent Supabase connection exhaustion
export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

globalForPrisma.prisma = prisma;

export default prisma;
