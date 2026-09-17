'use server';

import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';

export interface RegisterTenantInput {
  companyName: string;
  name: string;
  email: string;
  password: string;
}

const DEFAULT_COLUMNS = [
  { title: 'General', position: 0, color: '#64748b', isSystem: false },
  { title: 'Leads', position: 1, color: '#3b82f6', isSystem: false },
  { title: 'Follow up 1', position: 2, color: '#f59e0b', isSystem: false },
  { title: 'Follow up 2', position: 3, color: '#f59e0b', isSystem: false },
  { title: 'Follow up 3', position: 4, color: '#f59e0b', isSystem: false },
  { title: 'Fail', position: 5, color: '#ef4444', isSystem: false },
  { title: 'Pending', position: 6, color: '#8b5cf6', isSystem: false },
  { title: 'Success', position: 7, color: '#22c55e', isSystem: false },
];

function generateSubdomain(companyName: string): string {
  const base = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'workspace';
  const randomSuffix = Math.random().toString(36).substring(2, 6);
  return `${base}-${randomSuffix}`;
}

export async function registerTenant(input: RegisterTenantInput) {
  const companyName = input.companyName?.trim();
  const name = input.name?.trim();
  const email = input.email?.trim().toLowerCase();
  const password = input.password;

  if (!companyName || companyName.length < 2) {
    throw new Error('Company/workspace name must be at least 2 characters.');
  }

  if (!name || name.length < 2) {
    throw new Error('Admin full name must be at least 2 characters.');
  }

  if (!email || !email.includes('@')) {
    throw new Error('Invalid email address format.');
  }

  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  // Check if email already registered
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new Error('Email address is already registered. Please sign in or use another email.');
  }

  const subdomain = generateSubdomain(companyName);
  const passwordHash = await bcrypt.hash(password, 12);

  const result = await prisma.$transaction(async (tx) => {
    // 1. Create Tenant (Workspace)
    const tenant = await tx.tenant.create({
      data: {
        name: companyName,
        subdomain,
        companyInfo: JSON.stringify({
          name: companyName,
          products: '',
        }),
      },
    });

    // 2. Create User Admin
    const user = await tx.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: 'admin',
        tenantId: tenant.id,
      },
    });

    // 3. Create Main Board for this Tenant
    const board = await tx.board.create({
      data: {
        title: 'Main Board',
        tenantId: tenant.id,
      },
    });

    // 4. Create Default Columns
    for (const col of DEFAULT_COLUMNS) {
      await tx.column.create({
        data: {
          ...col,
          boardId: board.id,
        },
      });
    }

    return { tenant, user, board };
  });

  return {
    success: true,
    email: result.user.email,
    tenantName: result.tenant.name,
  };
}
