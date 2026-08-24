import { PrismaClient } from '@prisma/client';

const globalPrisma = globalThis as any;

const prisma: PrismaClient =
  globalPrisma.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalPrisma.__prisma = prisma;
}

export default prisma;
