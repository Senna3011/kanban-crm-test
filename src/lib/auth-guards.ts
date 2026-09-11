import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import { NextResponse } from 'next/server';

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  role: 'admin' | 'member' | string;
  tenantId: string;
  tenantName: string;
}

export async function getAuthSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return session;
}

export async function requireAuth(): Promise<AuthUser> {
  const session = await getAuthSession();
  if (!session?.user) {
    throw new Error('Unauthorized');
  }
  const user = session.user as any;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role || 'member',
    tenantId: user.tenantId,
    tenantName: user.tenantName,
  };
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireAuth();
  if (user.role !== 'admin') {
    throw new Error('Forbidden: Admin access required.');
  }
  return user;
}

export async function requireRole(allowedRoles: string[]): Promise<AuthUser> {
  const user = await requireAuth();
  if (!allowedRoles.includes(user.role)) {
    throw new Error(`Forbidden: Requires one of [${allowedRoles.join(', ')}] role.`);
  }
  return user;
}

export function unauthorizedResponse(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbiddenResponse(message = 'Forbidden: Admin access required.') {
  return NextResponse.json({ error: message }, { status: 403 });
}
