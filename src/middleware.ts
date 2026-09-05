import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { checkSubscription } from '@/lib/subscription-check';

export async function middleware(request: NextRequest) {
  const blocked = await checkSubscription(request.nextUrl.pathname);
  if (blocked) return blocked;
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
