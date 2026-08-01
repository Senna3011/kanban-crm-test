import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Create default tenant
  const tenant = await prisma.tenant.upsert({
    where: { subdomain: 'jetdigitalpro' },
    update: {},
    create: {
      name: 'Jet Digital Pro',
      subdomain: 'jetdigitalpro',
      companyInfo: JSON.stringify({
        name: 'Jet Digital Pro',
        products: 'Digital marketing services, SEO, web development',
      }),
    },
  });

  // Create admin user
  const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 12);
  const user = await prisma.user.upsert({
    where: { email: process.env.ADMIN_EMAIL || 'admin@jetdigitalpro.com' },
    update: {},
    create: {
      email: process.env.ADMIN_EMAIL || 'admin@jetdigitalpro.com',
      name: 'Admin',
      passwordHash,
      role: 'admin',
      tenantId: tenant.id,
    },
  });

  // Create board
  let board = await prisma.board.findFirst({
    where: { tenantId: tenant.id },
  });
  if (!board) {
    board = await prisma.board.create({
      data: { title: 'Main Board', tenantId: tenant.id },
    });
  }

  // Create default columns
  const defaultColumns = [
    { title: 'Unreads', position: 0, color: '#6b7280', isSystem: true },
    { title: 'Leads', position: 1, color: '#3b82f6', isSystem: false },
    { title: 'General', position: 2, color: '#64748b', isSystem: false },
    { title: 'Follow up 1', position: 3, color: '#f59e0b', isSystem: false },
    { title: 'Follow up 2', position: 4, color: '#f59e0b', isSystem: false },
    { title: 'Follow up 3', position: 5, color: '#f59e0b', isSystem: false },
    { title: 'Fail', position: 6, color: '#ef4444', isSystem: false },
    { title: 'Pending', position: 7, color: '#8b5cf6', isSystem: false },
    { title: 'Success', position: 8, color: '#22c55e', isSystem: false },
  ];

  for (const col of defaultColumns) {
    await prisma.column.upsert({
      where: { boardId_title: { boardId: board.id, title: col.title } },
      update: {},
      create: { ...col, boardId: board.id },
    });
  }

  console.log('Seed completed!');
  console.log(`  Tenant: ${tenant.name}`);
  console.log(`  Admin: ${user.email}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
