import { NextRequest } from "next/server";

// Simple in-memory rate limiter
const requests = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(request: NextRequest, key: string, maxRequests = 30, windowMs = 60000): boolean {
  const now = Date.now();
  const clientKey = `${key}_${getClientIP(request) || 'unknown'}`;
  
  const record = requests.get(clientKey);
  
  if (!record || now > record.resetTime) {
    // New window or expired
    requests.set(clientKey, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (record.count >= maxRequests) {
    return false; // Rate limit exceeded
  }
  
  record.count++;
  return true;
}

function getClientIP(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  const real = request.headers.get('x-real-ip');
  const connection = request.headers.get('x-forwarded-proto');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  if (real) {
    return real;
  }
  
  return (request as NextRequest & { ip?: string }).ip || null;
}

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of requests.entries()) {
    if (now > record.resetTime) {
      requests.delete(key);
    }
  }
}, 300000); // Cleanup every 5 minutes