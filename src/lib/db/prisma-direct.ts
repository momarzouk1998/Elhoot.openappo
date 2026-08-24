// Re-export prisma client for use in server components
// This avoids the "use server" issue when importing prisma in client components
export { default as prisma } from './prisma';
