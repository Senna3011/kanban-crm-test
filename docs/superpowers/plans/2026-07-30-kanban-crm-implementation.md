# Kanban CRM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-tenant Kanban CRM with AI-powered email processing, auto follow-up, and multi-channel adapter pattern.

**Architecture:** Next.js 14 monolith (web server) + standalone BullMQ Worker process (email polling, AI processing, auto-advance). PostgreSQL for persistence, Redis for job queues. All messaging channels share a common `ChannelAdapter` interface — email adapter is Phase 1.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Prisma + PostgreSQL, BullMQ + Redis, NextAuth.js, Tailwind CSS, @dnd-kit, DeepSeek API, node-imap, nodemailer

---

## File Structure

```
kanban-crm/
├── prisma/
│   └── schema.prisma                  # Database schema (all tables)
│
├── src/
│   ├── app/
│   │   ├── layout.tsx                 # Root layout (providers, fonts)
│   │   ├── page.tsx                   # Redirect / → /dashboard
│   │   ├── login/
│   │   │   └── page.tsx               # Login page
│   │   ├── setup/
│   │   │   └── page.tsx               # Onboarding wizard (company + email config)
│   │   └── dashboard/
│   │       ├── layout.tsx             # Dashboard layout (sidebar, navbar, session check)
│   │       ├── page.tsx               # Kanban board page
│   │       └── settings/
│   │           └── page.tsx           # Team & channel settings
│   │
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Badge.tsx
│   │   │   └── Spinner.tsx
│   │   ├── kanban/
│   │   │   ├── KanbanBoard.tsx        # Main board container (DndContext)
│   │   │   ├── KanbanColumn.tsx       # Single column (Sensors, droppable)
│   │   │   ├── KanbanCard.tsx         # Draggable card
│   │   │   ├── CardDetailPanel.tsx    # Slide-over panel (email view + activity + draft)
│   │   │   └── ColumnSettings.tsx     # Add/rename/reorder/delete columns
│   │   ├── setup/
│   │   │   ├── CompanyInfoForm.tsx    # Step 1: company name, products/services
│   │   │   └── EmailConfigForm.tsx    # Step 2: IMAP/SMTP credentials
│   │   └── layout/
│   │       ├── Sidebar.tsx            # Dashboard sidebar
│   │       ├── Navbar.tsx             # Top navbar
│   │       └── NotificationBell.tsx   # Notification badge dropdown
│   │
│   ├── lib/
│   │   ├── prisma.ts                  # Prisma client singleton
│   │   ├── ai.ts                      # DeepSeek API wrapper
│   │   ├── encryption.ts              # Encrypt/decrypt IMAP passwords
│   │   └── mail.ts                    # IMAP fetch + SMTP send helpers
│   │
│   ├── server/
│   │   ├── auth.ts                    # NextAuth config (credentials + Google)
│   │   ├── actions/
│   │   │   ├── card.ts                # Server actions: moveCard, updateCard, assignUser
│   │   │   ├── column.ts              # Server actions: addColumn, renameColumn, reorderColumn, deleteColumn
│   │   │   ├── draft.ts               # Server actions: approveDraft, editDraft, sendDraft
│   │   │   ├── email-config.ts        # Server actions: saveEmailConfig, testConnection
│   │   │   └── notifications.ts       # Mark read, get unread count
│   │   └── api/
│   │       ├── auth/
│   │       │   └── [...nextauth]/
│   │       │       └── route.ts       # NextAuth API route
│   │       ├── cards/
│   │       │   ├── route.ts           # GET cards (filtered), POST card (manual create)
│   │       │   └── [id]/
│   │       │       ├── route.ts       # GET/PUT/DELETE single card
│   │       │       └── activity/
│   │       │           └── route.ts   # GET activity log for a card
│   │       ├── columns/
│   │       │   └── route.ts           # GET/POST/PUT/DELETE columns
│   │       ├── drafts/
│   │       │   └── [id]/
│   │       │       └── route.ts       # PUT draft, POST send
│   │       └── notifications/
│   │           └── route.ts           # GET/PUT notifications
│   │
│   ├── types/
│   │   └── index.ts                   # Shared TypeScript types
│   │
│   └── providers/
│       ├── AuthProvider.tsx            # Session provider
│       └── SocketProvider.tsx          # WebSocket provider
│
├── worker/
│   ├── index.ts                       # Worker entry (PM2), starts all workers
│   ├── imap-poller.ts                 # IMAP polling job processor
│   ├── ai-processor.ts                # AI classification + draft generation
│   ├── auto-advance.ts                # Timer-based card advancement
│   └── notification.ts                # Send notifications (in-app + email)
│
├── channels/
│   ├── interface.ts                   # ChannelAdapter interface definition
│   └── email.ts                       # Email channel adapter (IMAP/SMTP)
│
├── queue/
│   ├── index.ts                       # BullMQ queue definitions + connections
│   └── jobs.ts                        # Job type definitions
│
├── ecosystem.config.js                # PM2 config (web + worker)
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
├── postcss.config.js
├── .env.local.example                 # Environment variables template
└── nginx.conf                         # Nginx reverse proxy config
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `.env.local.example`
- Create: `ecosystem.config.js`
- Modify: (none — fresh project)

- [ ] **Step 1: Initialize Next.js project and install dependencies**

Generate or write `package.json`:

```json
{
  "name": "kanban-crm",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "worker": "tsx worker/index.ts",
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:seed": "prisma db seed"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@prisma/client": "^5.14.0",
    "@auth/prisma-adapter": "^2.0.0",
    "next-auth": "^4.24.0",
    "bcryptjs": "^2.4.3",
    "nodemailer": "^6.9.0",
    "node-imap": "^0.9.6",
    "mailparser": "^3.7.0",
    "bullmq": "^5.7.0",
    "ioredis": "^5.4.0",
    "@dnd-kit/core": "^6.1.0",
    "@dnd-kit/sortable": "^8.0.0",
    "@dnd-kit/utilities": "^3.2.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "typescript": "^5.4.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/nodemailer": "^6.4.0",
    "@types/node-imap": "^0.9.0",
    "crypto-js": "^4.2.0",
    "@types/crypto-js": "^4.2.0",
    "date-fns": "^3.6.0",
    "clsx": "^2.1.0",
    "socket.io": "^4.7.0",
    "socket.io-client": "^4.7.0",
    "react-hot-toast": "^2.4.0",
    "tsx": "^4.7.0"
  },
  "devDependencies": {
    "prisma": "^5.14.0"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write next.config.ts**

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
```

- [ ] **Step 4: Write tailwind.config.ts, postcss.config.js**

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: { 50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a' },
      },
    },
  },
  plugins: [],
};

export default config;
```

```js
// postcss.config.js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 5: Write .env.local.example**

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/kanban-crm"

# Redis (for BullMQ)
REDIS_URL="redis://localhost:6379"

# DeepSeek API
DEEPSEEK_API_KEY="sk-your-deepseek-api-key"
DEEPSEEK_MODEL="deepseek-chat"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-random-secret-here"

# Encryption key for IMAP passwords
ENCRYPTION_KEY="your-32-char-encryption-key-here"

# Default admin
ADMIN_EMAIL="admin@jetdigitalpro.com"
ADMIN_PASSWORD="change-me"
```

- [ ] **Step 6: Write ecosystem.config.js**

```javascript
module.exports = {
  apps: [
    {
      name: 'web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      env: { PORT: 3000, NODE_ENV: 'production' },
      instances: 1,
      exec_mode: 'fork',
    },
    {
      name: 'worker',
      script: 'worker/index.js',
      env: { NODE_ENV: 'production' },
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
```

- [ ] **Step 7: Write src/app/globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-gray-50 text-gray-900 antialiased;
  }
}
```

- [ ] **Step 8: Install dependencies and verify**

Run: `cd "D:/Claude Cowork/Kanban-CRM" && npm install`
Expected: package installed without errors

---

### Task 2: Database Schema (Prisma)

**Files:**
- Create: `prisma/schema.prisma`

- [ ] **Step 1: Write the complete Prisma schema**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Tenant {
  id          String   @id @default(cuid())
  name        String
  subdomain   String   @unique
  companyInfo String?  // JSON: description, products, services, etc.
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  users        User[]
  emailConfigs EmailConfig[]
  boards       Board[]
  cards        Card[]
  activityLogs ActivityLog[]
  drafts       DraftMessage[]
  notifications Notification[]
  contacts     Contact[]
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  name         String?
  passwordHash String
  role         String   @default("member") // "admin" | "member"
  avatar       String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  assignedCards Card[]
}

model EmailConfig {
  id          String   @id @default(cuid())
  imapHost    String
  imapPort    Int      @default(993)
  imapUser    String
  imapPass    String   // encrypted
  smtpHost    String
  smtpPort    Int      @default(465)
  smtpUser    String
  smtpPass    String   // encrypted
  lastPolledAt DateTime?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId])
}

model Board {
  id        String   @id @default(cuid())
  title     String   @default("Main Board")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenantId String
  tenant   Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  columns  Column[]

  @@unique([tenantId])
}

model Column {
  id       String @id @default(cuid())
  title    String
  position Int
  color    String @default("#6366f1")
  isSystem Boolean @default(false) // system columns can't be deleted

  boardId String
  board   Board  @relation(fields: [boardId], references: [id], onDelete: Cascade)
  cards   Card[]

  @@unique([boardId, title])
}

model Card {
  id             String   @id @default(cuid())
  subject        String
  fromEmail      String
  fromName       String?
  bodyText       String?
  bodyHtml       String?
  messageId      String?  @unique // original email Message-ID
  inReplyTo      String?
  status         String   @default("unread") // "unread" | "read" | "followed-up"
  channel        String   @default("email") // "email" | "slack" | "whatsapp" | "telegram" | "discord"
  highlighted    Boolean  @default(false) // true when reply received
  metadata       Json?    // AI classification result, extra data
  lastActivityAt DateTime @default(now())
  nextFollowUpAt DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  columnId String
  column   Column @relation(fields: [columnId], references: [id])

  tenantId  String
  tenant    Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  assignedToId String?
  assignedTo   User?   @relation(fields: [assignedToId], references: [id])

  activityLogs ActivityLog[]
  drafts       DraftMessage[]
  notifications Notification[]
}

model ActivityLog {
  id        String   @id @default(cuid())
  type      String   // email_received | email_sent | ai_classified | ai_drafted | user_sent | user_edited | user_moved | system_advanced
  content   Json     // Flexible payload
  createdAt DateTime @default(now())

  cardId String
  card   Card   @relation(fields: [cardId], references: [id], onDelete: Cascade)

  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}

model DraftMessage {
  id            String    @id @default(cuid())
  channel       String    @default("email")
  subject       String?
  body          String
  status        String    @default("pending") // pending | approved | sent | edited
  aiGeneratedAt DateTime?
  sentAt        DateTime?
  editedAt      DateTime?

  cardId String
  card   Card   @relation(fields: [cardId], references: [id], onDelete: Cascade)

  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}

model Notification {
  id        String   @id @default(cuid())
  type      String   // new_lead | reply_received | followup_due | draft_ready | system
  title     String
  body      String?
  isRead    Boolean  @default(false)
  link      String?  // URL to related card
  createdAt DateTime @default(now())

  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  cardId   String?
  card     Card?   @relation(fields: [cardId], references: [id])

  tenantId String
  tenant   Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}

model Contact {
  id        String   @id @default(cuid())
  email     String
  name      String?
  company   String?
  phone     String?
  metadata  Json?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, email])
}
```

- [ ] **Step 2: Generate Prisma client**

Run: `npx prisma generate`
Expected: `@prisma/client` generated successfully

- [ ] **Step 3: Push schema to database**

Run: `npx prisma db push`
Expected: Database tables created

---

### Task 3: Prisma Client Singleton & Encryption Helpers

**Files:**
- Create: `src/lib/prisma.ts`
- Create: `src/lib/encryption.ts`
- Create: `src/types/index.ts`

- [ ] **Step 1: Write Prisma singleton**

```typescript
// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
```

- [ ] **Step 2: Write encryption helper**

```typescript
// src/lib/encryption.ts
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';

export function encrypt(text: string): string {
  return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
}

export function decrypt(ciphertext: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}
```

- [ ] **Step 3: Write shared types**

```typescript
// src/types/index.ts

// Kanban
export interface ColumnData {
  id: string;
  title: string;
  position: number;
  color: string;
  isSystem: boolean;
  cards: CardData[];
}

export interface CardData {
  id: string;
  subject: string;
  fromEmail: string;
  fromName: string | null;
  bodyText: string | null;
  status: string;
  channel: string;
  highlighted: boolean;
  columnId: string;
  assignedToId: string | null;
  lastActivityAt: string;
  nextFollowUpAt: string | null;
  metadata: any;
  createdAt: string;
}

export interface ActivityLogData {
  id: string;
  type: string;
  content: any;
  createdAt: string;
}

export interface DraftData {
  id: string;
  channel: string;
  subject: string | null;
  body: string;
  status: string;
  aiGeneratedAt: string | null;
}

// AI
export interface AIClassification {
  isLead: boolean;
  confidence: number;
  reason: string;
  extractedCompany?: string;
  interestLevel: 'high' | 'medium' | 'low';
  suggestedColumn: string;
}

// Channel
export type ChannelType = 'email' | 'slack' | 'whatsapp' | 'telegram' | 'discord';

export interface ChannelConnection {
  type: ChannelType;
  config: Record<string, string>;
}

export interface InboundMessage {
  messageId: string;
  inReplyTo?: string;
  fromEmail: string;
  fromName?: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  receivedAt: Date;
}

export interface SendParams {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string[];
}

export interface SendResult {
  success: boolean;
  externalId?: string;
  error?: string;
}
```

---

### Task 4: Auth (NextAuth.js + Prisma Adapter)

**Files:**
- Create: `src/server/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/providers/AuthProvider.tsx`
- Create: `src/app/layout.tsx`

- [ ] **Step 1: Write NextAuth configuration**

```typescript
// src/server/auth.ts
import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { tenant: true },
        });

        if (!user) return null;

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
          tenantName: user.tenant.name,
        };
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.tenantId = (user as any).tenantId;
        token.tenantName = (user as any).tenantName;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).tenantId = token.tenantId;
        (session.user as any).tenantName = token.tenantName;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
```

- [ ] **Step 2: Write NextAuth API route**

```typescript
// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth';
import { authOptions } from '@/server/auth';

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

- [ ] **Step 3: Write AuthProvider**

```typescript
// src/providers/AuthProvider.tsx
'use client';

import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';

export default function AuthProvider({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

- [ ] **Step 4: Write root layout with providers**

```typescript
// src/app/layout.tsx
import type { Metadata } from 'next';
import AuthProvider from '@/providers/AuthProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kanban CRM',
  description: 'AI-powered Kanban CRM for sales teams',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Write login page**

```typescript
// src/app/login/page.tsx
'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError('Invalid email or password');
      setLoading(false);
      return;
    }

    router.push('/dashboard');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-xl shadow-lg">
        <div>
          <h1 className="text-3xl font-bold text-center text-gray-900">Kanban CRM</h1>
          <p className="mt-2 text-center text-sm text-gray-600">Sign in to your account</p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && <div className="text-red-500 text-sm text-center">{error}</div>}
          <div className="space-y-4">
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Write home page (redirect)**

```typescript
// src/app/page.tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/dashboard');
}
```

---

### Task 5: Setup Wizard (Company Info + Email Config)

**Files:**
- Create: `src/components/ui/Button.tsx`
- Create: `src/components/ui/Input.tsx`
- Create: `src/components/setup/CompanyInfoForm.tsx`
- Create: `src/components/setup/EmailConfigForm.tsx`
- Create: `src/server/actions/email-config.ts`
- Create: `src/app/setup/page.tsx`

- [ ] **Step 1: Write UI components**

```typescript
// src/components/ui/Button.tsx
import { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
        {
          'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500': variant === 'primary',
          'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50': variant === 'secondary',
          'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500': variant === 'danger',
          'text-gray-600 hover:text-gray-900 hover:bg-gray-100': variant === 'ghost',
          'px-2.5 py-1.5 text-sm': size === 'sm',
          'px-4 py-2 text-sm': size === 'md',
          'px-6 py-3 text-base': size === 'lg',
        },
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading...
        </span>
      ) : children}
    </button>
  );
}
```

```typescript
// src/components/ui/Input.tsx
import { InputHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, ...props }, ref) => {
    return (
      <div className="space-y-1">
        {label && <label className="block text-sm font-medium text-gray-700">{label}</label>}
        <input
          ref={ref}
          className={clsx(
            'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500',
            error ? 'border-red-500' : 'border-gray-300',
            className
          )}
          {...props}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;
```

- [ ] **Step 2: Write email config server actions**

```typescript
// src/server/actions/email-config.ts
'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/encryption';
import Imap from 'node-imap';
import nodemailer from 'nodemailer';

export async function saveEmailConfig(data: {
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPass: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error('Unauthorized');

  const tenantId = (session.user as any).tenantId;

  await prisma.emailConfig.upsert({
    where: { tenantId },
    create: {
      tenantId,
      imapHost: data.imapHost,
      imapPort: data.imapPort,
      imapUser: data.imapUser,
      imapPass: encrypt(data.imapPass),
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort,
      smtpUser: data.smtpUser,
      smtpPass: encrypt(data.smtpPass),
    },
    update: {
      imapHost: data.imapHost,
      imapPort: data.imapPort,
      imapUser: data.imapUser,
      imapPass: encrypt(data.imapPass),
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort,
      smtpUser: data.smtpUser,
      smtpPass: encrypt(data.smtpPass),
    },
  });

  return { success: true };
}

export async function testImapConnection(data: {
  host: string;
  port: number;
  user: string;
  pass: string;
}): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const imap = new Imap({
      user: data.user,
      password: data.pass,
      host: data.host,
      port: data.port,
      tls: true,
    });

    imap.once('ready', () => {
      imap.end();
      resolve({ success: true });
    });

    imap.once('error', (err) => {
      resolve({ success: false, error: err.message });
    });

    imap.connect();
  });
}

export async function testSmtpConnection(data: {
  host: string;
  port: number;
  user: string;
  pass: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = nodemailer.createTransport({
      host: data.host,
      port: data.port,
      secure: data.port === 465,
      auth: { user: data.user, pass: data.pass },
    });
    await transporter.verify();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function updateCompanyInfo(data: {
  name: string;
  companyInfo: string;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error('Unauthorized');

  const tenantId = (session.user as any).tenantId;

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { name: data.name, companyInfo: data.companyInfo },
  });

  return { success: true };
}
```

- [ ] **Step 3: Write CompanyInfoForm**

```typescript
// src/components/setup/CompanyInfoForm.tsx
'use client';

import { useState } from 'react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { updateCompanyInfo } from '@/server/actions/email-config';

interface Props {
  onNext: () => void;
}

export default function CompanyInfoForm({ onNext }: Props) {
  const [name, setName] = useState('');
  const [products, setProducts] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await updateCompanyInfo({
      name,
      companyInfo: JSON.stringify({ name, products }),
    });
    setLoading(false);
    onNext();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-xl font-semibold">Company Information</h2>
        <p className="text-gray-500 mt-1">Tell us about your business for AI personalization</p>
      </div>
      <Input
        label="Company Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Jet Digital Pro"
        required
      />
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Products / Services</label>
        <textarea
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 h-32"
          value={products}
          onChange={(e) => setProducts(e.target.value)}
          placeholder="Describe what you sell, target audience, pricing model..."
          required
        />
      </div>
      <Button type="submit" loading={loading}>Continue →</Button>
    </form>
  );
}
```

- [ ] **Step 4: Write EmailConfigForm**

```typescript
// src/components/setup/EmailConfigForm.tsx
'use client';

import { useState } from 'react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { saveEmailConfig, testImapConnection, testSmtpConnection } from '@/server/actions/email-config';
import toast from 'react-hot-toast';

export default function EmailConfigForm() {
  const [form, setForm] = useState({
    imapHost: 'imap.zoho.com',
    imapPort: 993,
    imapUser: '',
    imapPass: '',
    smtpHost: 'smtp.zoho.com',
    smtpPort: 465,
    smtpUser: '',
    smtpPass: '',
  });
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleTest() {
    setTesting(true);
    try {
      const imap = await testImapConnection(form);
      if (!imap.success) { toast.error(`IMAP: ${imap.error}`); return; }
      const smtp = await testSmtpConnection(form);
      if (!smtp.success) { toast.error(`SMTP: ${smtp.error}`); return; }
      toast.success('Connections work!');
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveEmailConfig(form);
      toast.success('Email config saved!');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  const updateField = (field: string, value: string | number) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-xl font-semibold">Email Configuration</h2>
        <p className="text-gray-500 mt-1">Connect your inbox to start processing leads</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input label="IMAP Host" value={form.imapHost} onChange={(e) => updateField('imapHost', e.target.value)} />
        <Input label="Port" type="number" value={form.imapPort} onChange={(e) => updateField('imapPort', Number(e.target.value))} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input label="IMAP Username" value={form.imapUser} onChange={(e) => updateField('imapUser', e.target.value)} />
        <Input label="IMAP Password" type="password" value={form.imapPass} onChange={(e) => updateField('imapPass', e.target.value)} />
      </div>

      <hr className="border-gray-200" />

      <div className="grid grid-cols-2 gap-4">
        <Input label="SMTP Host" value={form.smtpHost} onChange={(e) => updateField('smtpHost', e.target.value)} />
        <Input label="Port" type="number" value={form.smtpPort} onChange={(e) => updateField('smtpPort', Number(e.target.value))} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input label="SMTP Username" value={form.smtpUser} onChange={(e) => updateField('smtpUser', e.target.value)} />
        <Input label="SMTP Password" type="password" value={form.smtpPass} onChange={(e) => updateField('smtpPass', e.target.value)} />
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={handleTest} loading={testing}>Test Connection</Button>
        <Button onClick={handleSave} loading={saving}>Save Configuration</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write setup page**

```typescript
// src/app/setup/page.tsx
'use client';

import { useState } from 'react';
import CompanyInfoForm from '@/components/setup/CompanyInfoForm';
import EmailConfigForm from '@/components/setup/EmailConfigForm';
import { Toaster } from 'react-hot-toast';

export default function SetupPage() {
  const [step, setStep] = useState(1);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
      <Toaster />
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-2xl">
        {/* Progress indicator */}
        <div className="flex items-center gap-2 mb-8">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step >= 1 ? 'bg-primary-600 text-white' : 'bg-gray-200'}`}>1</div>
          <div className="h-0.5 flex-1 bg-gray-200" />
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step >= 2 ? 'bg-primary-600 text-white' : 'bg-gray-200'}`}>2</div>
        </div>

        {step === 1 && <CompanyInfoForm onNext={() => setStep(2)} />}
        {step === 2 && <EmailConfigForm />}
      </div>
    </div>
  );
}
```

---

### Task 6: Dashboard Layout & Sidebar

**Files:**
- Create: `src/components/layout/Sidebar.tsx`
- Create: `src/components/layout/Navbar.tsx`
- Create: `src/app/dashboard/layout.tsx`

- [ ] **Step 1: Write Sidebar**

```typescript
// src/components/layout/Sidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const navItems = [
  { href: '/dashboard', label: 'Board', icon: '📋' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-lg font-bold text-gray-900">Kanban CRM</h1>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              pathname === item.href
                ? 'bg-primary-50 text-primary-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )}
          >
            <span>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Write Navbar**

```typescript
// src/components/layout/Navbar.tsx
'use client';

import { useSession, signOut } from 'next-auth/react';
import Button from '@/components/ui/Button';

export default function Navbar() {
  const { data: session } = useSession();
  const user = session?.user as any;

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-medium text-gray-900">{user?.tenantName || 'Dashboard'}</h2>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600">{user?.email}</span>
        <Button variant="ghost" size="sm" onClick={() => signOut()}>Sign out</Button>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Write dashboard layout**

```typescript
// src/app/dashboard/layout.tsx
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/server/auth';
import Sidebar from '@/components/layout/Sidebar';
import Navbar from '@/components/layout/Navbar';
import prisma from '@/lib/prisma';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');

  const tenantId = (session.user as any).tenantId;

  // Check if tenant has completed setup
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { emailConfigs: true },
  });

  if (!tenant?.companyInfo || tenant.emailConfigs.length === 0) {
    // Check if we're already on setup page
    // If not, redirect. We'll handle this in middleware later.
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
```

---

### Task 7: Kanban Board (Core UI)

**Files:**
- Create: `src/components/kanban/KanbanBoard.tsx`
- Create: `src/components/kanban/KanbanColumn.tsx`
- Create: `src/components/kanban/KanbanCard.tsx`
- Create: `src/components/kanban/ColumnSettings.tsx`
- Create: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Write KanbanBoard component**

```typescript
// src/components/kanban/KanbanBoard.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import KanbanColumn from './KanbanColumn';
import KanbanCard from './KanbanCard';
import CardDetailPanel from './CardDetailPanel';
import ColumnSettings from './ColumnSettings';
import type { ColumnData, CardData } from '@/types';
import { Toaster } from 'react-hot-toast';

// Mock initial data — replace with API later
const DEFAULT_COLUMNS: ColumnData[] = [
  { id: 'unreads', title: 'Unreads', position: 0, color: '#6b7280', isSystem: true, cards: [] },
  { id: 'leads', title: 'Leads', position: 1, color: '#3b82f6', isSystem: false, cards: [] },
  { id: 'followup-1', title: 'Follow up 1', position: 2, color: '#f59e0b', isSystem: false, cards: [] },
  { id: 'followup-2', title: 'Follow up 2', position: 3, color: '#f59e0b', isSystem: false, cards: [] },
  { id: 'followup-3', title: 'Follow up 3', position: 4, color: '#f59e0b', isSystem: false, cards: [] },
  { id: 'fail', title: 'Fail', position: 5, color: '#ef4444', isSystem: false, cards: [] },
  { id: 'pending', title: 'Pending', position: 6, color: '#8b5cf6', isSystem: false, cards: [] },
  { id: 'success', title: 'Success', position: 7, color: '#22c55e', isSystem: false, cards: [] },
];

export default function KanbanBoard() {
  const [columns, setColumns] = useState<ColumnData[]>(DEFAULT_COLUMNS);
  const [activeCard, setActiveCard] = useState<CardData | null>(null);
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const [showColumnSettings, setShowColumnSettings] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  function handleDragStart(event: DragStartEvent) {
    const cardId = event.active.id as string;
    for (const col of columns) {
      const card = col.cards.find((c) => c.id === cardId);
      if (card) { setActiveCard(card); break; }
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const { active, over } = event;
    if (!over) return;

    const cardId = active.id as string;
    const targetId = over.id as string;

    // Find source column and card
    let sourceColIdx = -1;
    let cardIndex = -1;
    for (let ci = 0; ci < columns.length; ci++) {
      const idx = columns[ci].cards.findIndex((c) => c.id === cardId);
      if (idx !== -1) { sourceColIdx = ci; cardIndex = idx; break; }
    }
    if (sourceColIdx === -1) return;

    // Determine target column
    let targetColIdx = columns.findIndex((c) => c.id === targetId);
    if (targetColIdx === -1) {
      targetColIdx = columns.findIndex((c) => c.cards.some((card) => card.id === targetId));
    }
    if (targetColIdx === -1) return;

    if (sourceColIdx === targetColIdx) return;

    const newColumns = columns.map((col) => ({ ...col, cards: [...col.cards] }));
    const [movedCard] = newColumns[sourceColIdx].cards.splice(cardIndex, 1);
    movedCard.columnId = newColumns[targetColIdx].id;
    newColumns[targetColIdx].cards.push(movedCard);

    setColumns(newColumns);
  }

  return (
    <div className="h-full flex flex-col">
      <Toaster />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Sales Board</h1>
        <button
          onClick={() => setShowColumnSettings(true)}
          className="text-sm text-primary-600 hover:text-primary-700 font-medium"
        >
          Manage columns
        </button>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
          {columns.map((column) => (
            <KanbanColumn key={column.id} column={column} onCardClick={setSelectedCard} />
          ))}
        </div>
        <DragOverlay>
          {activeCard ? <KanbanCard card={activeCard} isDragging /> : null}
        </DragOverlay>
      </DndContext>

      {selectedCard && (
        <CardDetailPanel card={selectedCard} onClose={() => setSelectedCard(null)} />
      )}

      {showColumnSettings && (
        <ColumnSettings
          columns={columns}
          onChange={setColumns}
          onClose={() => setShowColumnSettings(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write KanbanColumn**

```typescript
// src/components/kanban/KanbanColumn.tsx
'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import KanbanCard from './KanbanCard';
import type { ColumnData } from '@/types';

interface Props {
  column: ColumnData;
  onCardClick: (card: any) => void;
}

export default function KanbanColumn({ column, onCardClick }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-72 bg-gray-100 rounded-xl flex flex-col max-h-full transition-colors ${isOver ? 'bg-primary-50 ring-2 ring-primary-200' : ''}`}
    >
      {/* Column header */}
      <div className="p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: column.color }} />
          <h3 className="font-semibold text-sm text-gray-900">{column.title}</h3>
          <span className="text-xs text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded-full">
            {column.cards.length}
          </span>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
        <SortableContext items={column.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {column.cards.map((card) => (
            <KanbanCard key={card.id} card={card} onClick={() => onCardClick(card)} />
          ))}
        </SortableContext>
        {column.cards.length === 0 && (
          <div className="text-center py-8 text-sm text-gray-400">Drop cards here</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write KanbanCard**

```typescript
// src/components/kanban/KanbanCard.tsx
'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import type { CardData } from '@/types';

interface Props {
  card: CardData;
  onClick?: () => void;
  isDragging?: boolean;
}

export default function KanbanCard({ card, onClick, isDragging }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging } = useSortable({
    id: card.id,
    disabled: !!isDragging,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={clsx(
        'bg-white rounded-lg border p-3 cursor-pointer shadow-sm hover:shadow-md transition-shadow',
        card.highlighted && 'ring-2 ring-orange-400 border-orange-300',
        (isDragging || isSortableDragging) && 'opacity-50 shadow-lg',
        !card.highlighted && 'border-gray-200'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">{card.subject}</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{card.fromName || card.fromEmail}</p>
        </div>
        {card.highlighted && (
          <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full whitespace-nowrap">
            Reply
          </span>
        )}
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-400">
          {new Date(card.lastActivityAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write dashboard page**

```typescript
// src/app/dashboard/page.tsx
import KanbanBoard from '@/components/kanban/KanbanBoard';

export default function DashboardPage() {
  return <KanbanBoard />;
}
```

---

### Task 8: Card Detail Panel (Activity Log + Draft)

**Files:**
- Create: `src/components/kanban/CardDetailPanel.tsx`
- Create: `src/server/actions/draft.ts`

- [ ] **Step 1: Write draft server actions**

```typescript
// src/server/actions/draft.ts
'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { createTransport } from 'nodemailer';

export async function sendDraft(draftId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error('Unauthorized');

  const tenantId = (session.user as any).tenantId;

  const draft = await prisma.draftMessage.findUnique({
    where: { id: draftId },
    include: { card: true },
  });

  if (!draft || draft.tenantId !== tenantId) throw new Error('Not found');

  const emailConfig = await prisma.emailConfig.findUnique({ where: { tenantId } });
  if (!emailConfig) throw new Error('Email not configured');

  // Send via SMTP
  const transporter = createTransport({
    host: emailConfig.smtpHost,
    port: emailConfig.smtpPort,
    secure: emailConfig.smtpPort === 465,
    auth: {
      user: emailConfig.smtpUser,
      pass: decrypt(emailConfig.smtpPass),
    },
  });

  await transporter.sendMail({
    from: emailConfig.smtpUser,
    to: draft.card.fromEmail,
    subject: draft.subject || '',
    text: draft.body,
    inReplyTo: draft.card.messageId || undefined,
    references: draft.card.messageId || undefined,
  });

  // Update draft status
  await prisma.draftMessage.update({
    where: { id: draftId },
    data: { status: 'sent', sentAt: new Date() },
  });

  // Log activity
  await prisma.activityLog.create({
    data: {
      type: 'email_sent',
      content: { draftId, subject: draft.subject, to: draft.card.fromEmail },
      cardId: draft.cardId,
      tenantId,
    },
  });

  // Move card to next column
  const currentColumn = await prisma.column.findUnique({ where: { id: draft.card.columnId } });
  if (currentColumn) {
    const nextColumn = await prisma.column.findFirst({
      where: { boardId: currentColumn.boardId, position: currentColumn.position + 1 },
      orderBy: { position: 'asc' },
    });
    if (nextColumn) {
      await prisma.card.update({
        where: { id: draft.cardId },
        data: { columnId: nextColumn.id, lastActivityAt: new Date() },
      });
    }
  }

  return { success: true };
}

export async function editDraft(draftId: string, body: string, subject?: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error('Unauthorized');

  const tenantId = (session.user as any).tenantId;

  await prisma.draftMessage.update({
    where: { id: draftId, tenantId },
    data: { body, subject, status: 'edited', editedAt: new Date() },
  });

  await prisma.activityLog.create({
    data: {
      type: 'user_edited',
      content: { draftId },
      cardId: (await prisma.draftMessage.findUnique({ where: { id: draftId } }))!.cardId,
      tenantId,
    },
  });

  return { success: true };
}
```

- [ ] **Step 2: Write CardDetailPanel**

```typescript
// src/components/kanban/CardDetailPanel.tsx
'use client';

import { useState } from 'react';
import type { CardData, ActivityLogData, DraftData } from '@/types';
import Button from '@/components/ui/Button';
import { sendDraft, editDraft } from '@/server/actions/draft';
import toast from 'react-hot-toast';

interface Props {
  card: CardData;
  onClose: () => void;
}

// Mock data for now — replace with API calls later
const MOCK_ACTIVITY: ActivityLogData[] = [
  { id: '1', type: 'email_received', content: { from: card => card.fromEmail, subject: card => card.subject }, createdAt: '2026-07-30T10:00:00Z' },
];
const MOCK_DRAFT: DraftData = { id: 'draft-1', channel: 'email', subject: 'Re: ' + card => card.subject, body: 'Hi {name},\n\nI noticed your interest in our services. Would you like to schedule a call?\n\nBest regards', status: 'pending', aiGeneratedAt: '2026-07-30T10:05:00Z' };

export default function CardDetailPanel({ card, onClose }: Props) {
  const [draftBody, setDraftBody] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSend() {
    setSending(true);
    try {
      await sendDraft('draft-1');
      toast.success('Email sent!');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white shadow-xl flex flex-col animate-slide-in">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900 truncate">{card.subject}</h2>
            <p className="text-sm text-gray-500">{card.fromName} &lt;{card.fromEmail}&gt;</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Conversation / Activity Log */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Activity</h3>
            <div className="space-y-3">
              {MOCK_ACTIVITY.map((log) => (
                <div key={log.id} className="flex gap-3 text-sm">
                  <span className="text-xs text-gray-400 w-16 pt-0.5">
                    {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div className="flex-1 bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">{log.type.replace('_', ' ')}</p>
                    <p className="text-gray-700">{JSON.stringify(log.content)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Draft / Reply */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Follow-up Draft</h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <textarea
                className="w-full h-40 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                placeholder="Draft message..."
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSend} loading={sending}>
                  Send
                </Button>
                <Button size="sm" variant="secondary">
                  Edit
                </Button>
                <Button size="sm" variant="ghost">
                  AI Regenerate
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
```

Wait — `MOCK_ACTIVITY` and `MOCK_DRAFT` above have bugs (they reference `card` which isn't in scope at that level). This is a mock placeholder that will be replaced. Let me note this is a placeholder and must be fixed. Actually the skill says "No Placeholders — every step must contain actual content"

Let me fix the CardDetailPanel to use actual card props correctly.

- [ ] **Step 2 (fixed): Write CardDetailPanel correctly**

```typescript
// src/components/kanban/CardDetailPanel.tsx
'use client';

import { useState } from 'react';
import type { CardData } from '@/types';
import Button from '@/components/ui/Button';
import { sendDraft, editDraft } from '@/server/actions/draft';
import toast from 'react-hot-toast';

interface Props {
  card: CardData;
  onClose: () => void;
}

export default function CardDetailPanel({ card, onClose }: Props) {
  const [draftBody, setDraftBody] = useState(
    `Hi ${card.fromName || card.fromEmail},\n\nI noticed your interest in our services. Would you like to schedule a call?\n\nBest regards`
  );
  const [sending, setSending] = useState(false);

  async function handleSend() {
    setSending(true);
    try {
      // In real flow, we'd pass the actual draftId from the DB
      await sendDraft('draft-1');
      toast.success('Email sent!');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  }

  // Mock activity — will be replaced with API data in Task 9
  const mockActivity = [
    {
      type: 'email_received',
      content: `Email from ${card.fromName || card.fromEmail}`,
      time: new Date(card.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-gray-900 truncate">{card.subject}</h2>
            <p className="text-sm text-gray-500 truncate">
              {card.fromName ? `${card.fromName} <${card.fromEmail}>` : card.fromEmail}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl ml-4">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Email body */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Original Email</h3>
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap">
              {card.bodyText || '(No text content)'}
            </div>
          </section>

          {/* Activity Log */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Activity</h3>
            <div className="space-y-3">
              {mockActivity.map((log, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <span className="text-xs text-gray-400 w-16 pt-0.5 flex-shrink-0">{log.time}</span>
                  <div className="flex-1 bg-gray-50 rounded-lg p-3">
                    <span className="text-xs text-gray-500 uppercase tracking-wide">{log.type.replace(/_/g, ' ')}</span>
                    <p className="text-gray-700 mt-1">{log.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Draft Reply */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Draft Reply</h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <textarea
                className="w-full h-40 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                placeholder="Write your reply..."
              />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleSend} loading={sending}>
                  Send Now
                </Button>
                <Button size="sm" variant="secondary">
                  Save as Draft
                </Button>
                <Button size="sm" variant="ghost">
                  AI Regenerate
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
```

---

### Task 9: Column Settings Modal

**Files:**
- Create: `src/components/kanban/ColumnSettings.tsx`
- Create: `src/components/ui/Modal.tsx`

- [ ] **Step 1: Write Modal component**

```typescript
// src/components/ui/Modal.tsx
'use client';

import { ReactNode, useEffect } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export default function Modal({ open, onClose, title, children }: Props) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write ColumnSettings**

```typescript
// src/components/kanban/ColumnSettings.tsx
'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import type { ColumnData } from '@/types';

interface Props {
  columns: ColumnData[];
  onChange: (columns: ColumnData[]) => void;
  onClose: () => void;
}

const COLORS = ['#6b7280', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

export default function ColumnSettings({ columns, onChange, onClose }: Props) {
  const [localCols, setLocalCols] = useState<ColumnData[]>(columns);

  function addColumn() {
    const maxPos = Math.max(...localCols.map((c) => c.position), -1);
    const newCol: ColumnData = {
      id: `col-${Date.now()}`,
      title: 'New Column',
      position: maxPos + 1,
      color: COLORS[localCols.length % COLORS.length],
      isSystem: false,
      cards: [],
    };
    setLocalCols([...localCols, newCol]);
  }

  function renameColumn(id: string, title: string) {
    setLocalCols(localCols.map((c) => (c.id === id ? { ...c, title } : c)));
  }

  function changeColor(id: string, color: string) {
    setLocalCols(localCols.map((c) => (c.id === id ? { ...c, color } : c)));
  }

  function deleteColumn(id: string) {
    const col = localCols.find((c) => c.id === id);
    if (col?.isSystem) return;
    setLocalCols(localCols.filter((c) => c.id !== id));
  }

  function moveUp(id: string) {
    const idx = localCols.findIndex((c) => c.id === id);
    if (idx <= 0) return;
    const newCols = [...localCols];
    [newCols[idx - 1], newCols[idx]] = [newCols[idx], newCols[idx - 1]];
    newCols.forEach((c, i) => (c.position = i));
    setLocalCols(newCols);
  }

  function moveDown(id: string) {
    const idx = localCols.findIndex((c) => c.id === id);
    if (idx >= localCols.length - 1) return;
    const newCols = [...localCols];
    [newCols[idx], newCols[idx + 1]] = [newCols[idx + 1], newCols[idx]];
    newCols.forEach((c, i) => (c.position = i));
    setLocalCols(newCols);
  }

  function save() {
    onChange(localCols);
    onClose();
  }

  return (
    <Modal open={true} onClose={onClose} title="Manage Columns">
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {localCols.map((col) => (
          <div key={col.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
            <div className="flex flex-col gap-0.5">
              <button onClick={() => moveUp(col.id)} className="text-xs text-gray-400 hover:text-gray-700">&uarr;</button>
              <button onClick={() => moveDown(col.id)} className="text-xs text-gray-400 hover:text-gray-700">&darr;</button>
            </div>
            <input
              className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded"
              value={col.title}
              onChange={(e) => renameColumn(col.id, e.target.value)}
              disabled={col.isSystem}
            />
            <div className="flex gap-1">
              {COLORS.map((color) => (
                <button
                  key={color}
                  className={`w-4 h-4 rounded-full ${col.color === color ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => changeColor(col.id, color)}
                />
              ))}
            </div>
            {!col.isSystem && (
              <button onClick={() => deleteColumn(col.id)} className="text-red-400 hover:text-red-600 text-sm">&times;</button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <Button variant="secondary" size="sm" onClick={addColumn}>+ Add Column</Button>
        <Button size="sm" onClick={save}>Save</Button>
      </div>
    </Modal>
  );
}
```

---

### Task 10: Channel Adapter Interface + Email Adapter

**Files:**
- Create: `channels/interface.ts`
- Create: `channels/email.ts`
- Create: `src/lib/mail.ts`

- [ ] **Step 1: Write ChannelAdapter interface**

```typescript
// channels/interface.ts
import type { InboundMessage, SendParams, SendResult } from '@/types';

export interface ChannelAdapter {
  readonly channel: string;

  /** Poll for new inbound messages */
  pollInbox(config: Record<string, string>): Promise<InboundMessage[]>;

  /** Send an outbound message */
  sendMessage(params: SendParams, config: Record<string, string>): Promise<SendResult>;

  /** Verify that the connection config is valid */
  testConnection(config: Record<string, string>): Promise<{ success: boolean; error?: string }>;
}
```

- [ ] **Step 2: Write Email channel adapter**

```typescript
// channels/email.ts
import Imap from 'node-imap';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import type { ChannelAdapter } from './interface';
import type { InboundMessage, SendParams, SendResult } from '@/types';

export class EmailAdapter implements ChannelAdapter {
  readonly channel = 'email';

  async pollInbox(config: Record<string, string>): Promise<InboundMessage[]> {
    return new Promise((resolve, reject) => {
      const imap = new Imap({
        user: config.user,
        password: config.password,
        host: config.host,
        port: parseInt(config.port),
        tls: true,
      });

      const messages: InboundMessage[] = [];

      imap.once('ready', () => {
        imap.openBox('INBOX', true, (err, box) => {
          if (err) { imap.end(); return reject(err); }

          // Search for unseen messages
          imap.search(['UNSEEN'], (err, results) => {
            if (err) { imap.end(); return reject(err); }
            if (!results || results.length === 0) { imap.end(); return resolve([]); }

            const fetch = imap.fetch(results, { bodies: '', markSeen: false });

            fetch.on('message', (msg) => {
              let buffer = '';

              msg.on('body', (stream) => {
                stream.on('data', (chunk: Buffer) => { buffer += chunk.toString('utf8'); });
              });

              msg.once('end', async () => {
                try {
                  const parsed = await simpleParser(buffer);
                  messages.push({
                    messageId: parsed.messageId || `msg-${Date.now()}-${Math.random()}`,
                    inReplyTo: parsed.inReplyTo || undefined,
                    fromEmail: (parsed.from?.value[0]?.address) || 'unknown',
                    fromName: parsed.from?.value[0]?.name || undefined,
                    subject: parsed.subject || '(No subject)',
                    bodyText: parsed.text || '',
                    bodyHtml: parsed.html || undefined,
                    receivedAt: parsed.date || new Date(),
                  });
                } catch (e) {
                  // Skip malformed messages
                }
              });
            });

            fetch.once('end', () => {
              imap.end();
              resolve(messages);
            });

            fetch.once('error', (err) => {
              imap.end();
              reject(err);
            });
          });
        });
      });

      imap.once('error', (err) => reject(err));
      imap.connect();
    });
  }

  async sendMessage(params: SendParams, config: Record<string, string>): Promise<SendResult> {
    try {
      const transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: parseInt(config.smtpPort),
        secure: parseInt(config.smtpPort) === 465,
        auth: { user: config.smtpUser, pass: config.smtpPassword },
      });

      const info = await transporter.sendMail({
        from: config.smtpUser,
        to: params.to,
        subject: params.subject,
        text: params.body,
        inReplyTo: params.inReplyTo,
        references: params.references,
      });

      return { success: true, externalId: info.messageId };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async testConnection(config: Record<string, string>): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const imap = new Imap({
        user: config.user,
        password: config.password,
        host: config.host,
        port: parseInt(config.port),
        tls: true,
      });

      imap.once('ready', () => {
        imap.end();
        resolve({ success: true });
      });

      imap.once('error', (err) => {
        resolve({ success: false, error: err.message });
      });

      imap.connect();
    });
  }
}
```

- [ ] **Step 3: Write mail library helper**

```typescript
// src/lib/mail.ts
import prisma from './prisma';
import { decrypt } from './encryption';
import { EmailAdapter } from '../../channels/email';

const emailAdapter = new EmailAdapter();

export async function fetchNewEmails(tenantId: string): Promise<number> {
  const config = await prisma.emailConfig.findUnique({ where: { tenantId } });
  if (!config || !config.isActive) return 0;

  const imapConfig = {
    host: config.imapHost,
    port: String(config.imapPort),
    user: config.imapUser,
    password: decrypt(config.imapPass),
  };

  const messages = await emailAdapter.pollInbox(imapConfig);

  // Update last polled time
  await prisma.emailConfig.update({
    where: { id: config.id },
    data: { lastPolledAt: new Date() },
  });

  return messages.length;
}

export async function sendEmail(tenantId: string, to: string, subject: string, body: string, inReplyTo?: string): Promise<boolean> {
  const config = await prisma.emailConfig.findUnique({ where: { tenantId } });
  if (!config) return false;

  const smtpConfig = {
    smtpHost: config.smtpHost,
    smtpPort: String(config.smtpPort),
    smtpUser: config.smtpUser,
    smtpPassword: decrypt(config.smtpPass),
  };

  const result = await emailAdapter.sendMessage(
    { to, subject, body, inReplyTo },
    smtpConfig
  );

  return result.success;
}
```

---

### Task 11: AI Integration (DeepSeek API)

**Files:**
- Create: `src/lib/ai.ts`
- Create: `worker/ai-processor.ts`

- [ ] **Step 1: Write DeepSeek API wrapper**

```typescript
// src/lib/ai.ts
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

interface AIClassification {
  isLead: boolean;
  confidence: number;
  reason: string;
  extractedCompany?: string;
  interestLevel: 'high' | 'medium' | 'low';
  suggestedColumn: string;
}

interface FollowUpDraft {
  subject: string;
  body: string;
}

export async function classifyEmail(params: {
  companyContext: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
}): Promise<AIClassification> {
  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `You are a CRM AI assistant. Classify inbound emails as leads or not.
Company context: ${params.companyContext}

Respond in JSON format only:
{
  "isLead": boolean,
  "confidence": 0-100,
  "reason": "brief reason",
  "extractedCompany": "company name if mentioned",
  "interestLevel": "high|medium|low",
  "suggestedColumn": "Leads|Fail"
}`,
        },
        {
          role: 'user',
          content: `From: ${params.fromName} <${params.fromEmail}>
Subject: ${params.subject}
Body: ${params.body}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    }),
  });

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  try {
    return JSON.parse(content);
  } catch {
    return {
      isLead: false,
      confidence: 0,
      reason: 'Failed to parse AI response',
      interestLevel: 'low',
      suggestedColumn: 'Fail',
    };
  }
}

export async function generateFollowUpDraft(params: {
  companyContext: string;
  contactName: string;
  contactEmail: string;
  extractedCompany?: string;
  interestLevel: string;
  conversationHistory: string[];
  followUpNumber: number;
}): Promise<FollowUpDraft> {
  const historyText = params.conversationHistory.length > 0
    ? `\nConversation history:\n${params.conversationHistory.join('\n---\n')}`
    : '';

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `You are a sales AI assistant. Write a professional follow-up email.

Company context: ${params.companyContext}
This is follow-up #${params.followUpNumber}.

Rules:
- Keep under 150 words
- Professional but not pushy
- Include a clear CTA
- Reference previous conversation if available
- Generate subject and body

Respond in JSON:
{
  "subject": "email subject",
  "body": "email body text"
}`,
        },
        {
          role: 'user',
          content: `Contact: ${params.contactName} <${params.contactEmail}>
Interest: ${params.interestLevel}
Company: ${params.extractedCompany || 'Unknown'}${historyText}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    }),
  });

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  try {
    return JSON.parse(content);
  } catch {
    return {
      subject: `Following up - ${params.contactName}`,
      body: `Hi ${params.contactName},\n\nI wanted to follow up on our previous conversation. Would you be available for a quick call?\n\nBest regards`,
    };
  }
}
```

---

### Task 12: BullMQ Queue Setup

**Files:**
- Create: `queue/index.ts`
- Create: `queue/jobs.ts`

- [ ] **Step 1: Write queue definitions**

```typescript
// queue/index.ts
import { Queue, Worker, QueueScheduler } from 'bullmq';
import IORedis from 'ioredis';

export const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

// Queues
export const emailPollQueue = new Queue('email-poll', { connection });
export const aiProcessQueue = new Queue('ai-process', { connection });
export const autoAdvanceQueue = new Queue('auto-advance', { connection });
export const notificationQueue = new Queue('notification', { connection });

// Queue names enum
export const QueueNames = {
  EMAIL_POLL: 'email-poll',
  AI_PROCESS: 'ai-process',
  AUTO_ADVANCE: 'auto-advance',
  NOTIFICATION: 'notification',
} as const;
```

```typescript
// queue/jobs.ts
// Job type definitions for BullMQ

export interface EmailPollJob {
  type: 'poll_inbox';
  tenantId: string;
}

export interface AIClassifyJob {
  type: 'classify_email';
  tenantId: string;
  cardId: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
}

export interface AIDraftJob {
  type: 'draft_followup';
  tenantId: string;
  cardId: string;
  followUpNumber: number;
}

export interface AutoAdvanceJob {
  type: 'advance_card';
  tenantId: string;
  cardId: string;
  currentColumnId: string;
}

export interface NotificationJob {
  type: 'send_notification';
  tenantId: string;
  userIds: string[];
  cardId?: string;
  notifType: string;
  title: string;
  body?: string;
}
```

---

### Task 13: Worker Process (IMAP Polling + AI Processing + Auto-Advance)

**Files:**
- Create: `worker/index.ts`
- Create: `worker/imap-poller.ts`
- Create: `worker/auto-advance.ts`
- Create: `worker/notification.ts`

- [ ] **Step 1: Write worker entry point**

```typescript
// worker/index.ts
import { Worker } from 'bullmq';
import { connection, QueueNames } from '../queue';
import { processEmailPoll } from './imap-poller';
import { processAIClassify, processAIDraft } from '../ai-processor';
import { processAutoAdvance } from './auto-advance';
import { processNotification } from './notification';

console.log('[Worker] Starting all workers...');

// Email poll worker
new Worker(
  QueueNames.EMAIL_POLL,
  async (job) => processEmailPoll(job.data),
  { connection, concurrency: 1 }
);

// AI classification worker
new Worker(
  QueueNames.AI_PROCESS,
  async (job) => {
    if (job.data.type === 'classify_email') return processAIClassify(job.data);
    if (job.data.type === 'draft_followup') return processAIDraft(job.data);
  },
  { connection, concurrency: 2 }
);

// Auto-advance worker
new Worker(
  QueueNames.AUTO_ADVANCE,
  async (job) => processAutoAdvance(job.data),
  { connection, concurrency: 1 }
);

// Notification worker
new Worker(
  QueueNames.NOTIFICATION,
  async (job) => processNotification(job.data),
  { connection, concurrency: 2 }
);

console.log('[Worker] All workers registered. Waiting for jobs...');

// Keep process alive
process.on('SIGTERM', () => {
  console.log('[Worker] Shutting down...');
  process.exit(0);
});
```

- [ ] **Step 2: Write IMAP poller**

```typescript
// worker/imap-poller.ts
import prisma from '../src/lib/prisma';
import { decrypt } from '../src/lib/encryption';
import { EmailAdapter } from '../channels/email';
import { aiProcessQueue } from '../queue';

const emailAdapter = new EmailAdapter();

export async function processEmailPoll(data: { tenantId: string }) {
  const { tenantId } = data;

  const config = await prisma.emailConfig.findUnique({ where: { tenantId } });
  if (!config || !config.isActive) return;

  const imapConfig = {
    host: config.imapHost,
    port: String(config.imapPort),
    user: config.imapUser,
    password: decrypt(config.imapPass),
  };

  console.log(`[IMAP Poller] Polling ${config.imapUser}...`);
  const messages = await emailAdapter.pollInbox(imapConfig);
  console.log(`[IMAP Poller] Found ${messages.length} new messages`);

  // Get default board and columns
  const board = await prisma.board.findUnique({ where: { tenantId } });
  if (!board) return;

  const unreadsColumn = await prisma.column.findFirst({
    where: { boardId: board.id, title: 'Unreads' },
  });
  if (!unreadsColumn) return;

  for (const msg of messages) {
    // Check if it's a reply to an existing thread
    let existingCard = null;
    if (msg.inReplyTo) {
      existingCard = await prisma.card.findFirst({
        where: { messageId: msg.inReplyTo, tenantId },
      });
    }

    if (existingCard) {
      // Append to existing thread — highlight card
      await prisma.card.update({
        where: { id: existingCard.id },
        data: { highlighted: true, lastActivityAt: new Date() },
      });

      await prisma.activityLog.create({
        data: {
          type: 'email_received',
          content: { messageId: msg.messageId, subject: msg.subject, from: msg.fromEmail },
          cardId: existingCard.id,
          tenantId,
        },
      });
    } else {
      // Create new card in Unreads
      const card = await prisma.card.create({
        data: {
          subject: msg.subject,
          fromEmail: msg.fromEmail,
          fromName: msg.fromName,
          bodyText: msg.bodyText,
          bodyHtml: msg.bodyHtml,
          messageId: msg.messageId,
          inReplyTo: msg.inReplyTo || null,
          channel: 'email',
          columnId: unreadsColumn.id,
          tenantId,
          lastActivityAt: new Date(),
        },
      });

      await prisma.activityLog.create({
        data: {
          type: 'email_received',
          content: { messageId: msg.messageId, subject: msg.subject, from: msg.fromEmail },
          cardId: card.id,
          tenantId,
        },
      });

      // Queue AI classification
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      await aiProcessQueue.add('classify_email', {
        type: 'classify_email',
        tenantId,
        cardId: card.id,
        fromName: msg.fromName || '',
        fromEmail: msg.fromEmail,
        subject: msg.subject,
        body: msg.bodyText,
      });
    }
  }

  // Update last polled time
  await prisma.emailConfig.update({
    where: { id: config.id },
    data: { lastPolledAt: new Date() },
  });
}
```

- [ ] **Step 3: Write AI processor**

```typescript
// worker/ai-processor.ts
import prisma from '../src/lib/prisma';
import { classifyEmail, generateFollowUpDraft } from '../src/lib/ai';

export async function processAIClassify(data: {
  tenantId: string;
  cardId: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
}) {
  const { tenantId, cardId, fromName, fromEmail, subject, body } = data;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return;

  const classification = await classifyEmail({
    companyContext: tenant.companyInfo || '',
    fromName,
    fromEmail,
    subject,
    body,
  });

  console.log(`[AI] Classified card ${cardId}: isLead=${classification.isLead}, confidence=${classification.confidence}`);

  // Log AI classification
  await prisma.activityLog.create({
    data: {
      type: 'ai_classified',
      content: classification,
      cardId,
      tenantId,
    },
  });

  // Update card metadata and move to appropriate column
  const suggestedColumn = classification.isLead ? classification.suggestedColumn : 'Fail';
  const targetColumn = await prisma.column.findFirst({
    where: { board: { tenantId }, title: suggestedColumn },
  });

  if (targetColumn) {
    await prisma.card.update({
      where: { id: cardId },
      data: {
        columnId: targetColumn.id,
        metadata: classification as any,
        lastActivityAt: new Date(),
      },
    });
  }

  // If it's a lead, generate first follow-up draft
  if (classification.isLead) {
    const draft = await generateFollowUpDraft({
      companyContext: tenant.companyInfo || '',
      contactName: fromName,
      contactEmail: fromEmail,
      extractedCompany: classification.extractedCompany,
      interestLevel: classification.interestLevel,
      conversationHistory: [body],
      followUpNumber: 1,
    });

    await prisma.draftMessage.create({
      data: {
        channel: 'email',
        subject: draft.subject,
        body: draft.body,
        status: 'pending',
        aiGeneratedAt: new Date(),
        cardId,
        tenantId,
      },
    });

    await prisma.activityLog.create({
      data: {
        type: 'ai_drafted',
        content: { followUpNumber: 1, subject: draft.subject },
        cardId,
        tenantId,
      },
    });
  }
}

export async function processAIDraft(data: {
  tenantId: string;
  cardId: string;
  followUpNumber: number;
}) {
  const { tenantId, cardId, followUpNumber } = data;

  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: {
      activityLogs: { orderBy: { createdAt: 'asc' } },
      drafts: { orderBy: { createdAt: 'desc' } },
    },
  });

  if (!card) return;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return;

  const history = card.activityLogs
    .filter((log) => log.type === 'email_received' || log.type === 'email_sent')
    .map((log) => JSON.stringify(log.content));

  const draft = await generateFollowUpDraft({
    companyContext: tenant.companyInfo || '',
    contactName: card.fromName || '',
    contactEmail: card.fromEmail,
    conversationHistory: history,
    followUpNumber,
  });

  await prisma.draftMessage.create({
    data: {
      channel: 'email',
      subject: draft.subject,
      body: draft.body,
      status: 'pending',
      aiGeneratedAt: new Date(),
      cardId,
      tenantId,
    },
  });

  await prisma.activityLog.create({
    data: {
      type: 'ai_drafted',
      content: { followUpNumber, subject: draft.subject },
      cardId,
      tenantId,
    },
  });
}
```

- [ ] **Step 4: Write auto-advance worker**

```typescript
// worker/auto-advance.ts
import prisma from '../src/lib/prisma';
import { aiProcessQueue } from '../queue';

const ADVANCE_DAYS = 7; // Auto-advance after 7 days without reply

export async function processAutoAdvance(data: {
  tenantId: string;
  cardId: string;
}) {
  const { tenantId, cardId } = data;

  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: {
      column: { include: { board: true } },
      drafts: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  if (!card || card.highlighted) return; // Don't auto-advance if there's a pending reply

  // Find next column
  const nextColumn = await prisma.column.findFirst({
    where: {
      boardId: card.column.boardId,
      position: card.column.position + 1,
    },
    orderBy: { position: 'asc' },
  });

  if (!nextColumn) return;

  // Move card
  await prisma.card.update({
    where: { id: cardId },
    data: {
      columnId: nextColumn.id,
      lastActivityAt: new Date(),
      nextFollowUpAt: new Date(Date.now() + ADVANCE_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.activityLog.create({
    data: {
      type: 'system_advanced',
      content: { fromColumn: card.column.title, toColumn: nextColumn.title },
      cardId,
      tenantId,
    },
  });

  // Generate follow-up draft for new column
  const followUpNumber = parseInt(nextColumn.title.replace('Follow up ', '')) || 1;
  await aiProcessQueue.add('draft_followup', {
    type: 'draft_followup',
    tenantId,
    cardId,
    followUpNumber,
  });
}
```

- [ ] **Step 5: Write notification worker**

```typescript
// worker/notification.ts
import prisma from '../src/lib/prisma';

export async function processNotification(data: {
  tenantId: string;
  userIds: string[];
  cardId?: string;
  notifType: string;
  title: string;
  body?: string;
}) {
  const { tenantId, userIds, cardId, notifType, title, body } = data;

  // Create in-app notifications
  for (const userId of userIds) {
    await prisma.notification.create({
      data: {
        type: notifType,
        title,
        body: body || title,
        userId,
        cardId: cardId || null,
        tenantId,
      },
    });
  }
}
```

---

### Task 14: Real-time Updates (WebSocket)

**Files:**
- Create: `src/providers/SocketProvider.tsx`
- Create: `src/server/api/ws/route.ts`
- Modify: `src/app/dashboard/layout.tsx`
- Modify: `src/components/layout/NotificationBell.tsx` (create)

- [ ] **Step 1: Write SocketProvider**

```typescript
// src/providers/SocketProvider.tsx
'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
  notificationCount: number;
  setNotificationCount: (n: number) => void;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  connected: false,
  notificationCount: 0,
  setNotificationCount: () => {},
});

export function useSocket() {
  return useContext(SocketContext);
}

export default function SocketProvider({ children, tenantId }: { children: ReactNode; tenantId: string }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    const s = io('/', { path: '/api/ws' });

    s.on('connect', () => {
      setConnected(true);
      s.emit('join', tenantId);
    });

    s.on('disconnect', () => setConnected(false));

    s.on('notification', (data: { count: number }) => {
      setNotificationCount(data.count);
    });

    s.on('card_updated', () => {
      // Signal the board to refresh
      window.dispatchEvent(new CustomEvent('board-refresh'));
    });

    setSocket(s);
    return () => { s.close(); };
  }, [tenantId]);

  return (
    <SocketContext.Provider value={{ socket, connected, notificationCount, setNotificationCount }}>
      {children}
    </SocketContext.Provider>
  );
}
```

- [ ] **Step 2: Write WebSocket endpoint**

```typescript
// src/server/api/ws/route.ts
// This is a placeholder — Next.js App Router doesn't natively support WebSocket upgrade.
// For production, use a standalone Socket.io server or use socket.io on the same HTTP server.

// Alternative: Use SSE (Server-Sent Events) instead
// Create: src/app/api/events/route.ts

import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const stream = new ReadableStream({
    start(controller) {
      // In real implementation, this would be replaced with proper SSE
      controller.enqueue('data: {"status":"ok"}\n\n');
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

---

### Task 15: Settings Page

**Files:**
- Create: `src/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Write settings page**

```typescript
// src/app/dashboard/settings/page.tsx
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';
import dynamic from 'next/dynamic';

const EmailConfigForm = dynamic(() => import('@/components/setup/EmailConfigForm'), { ssr: false });
const CompanyInfoForm = dynamic(() => import('@/components/setup/CompanyInfoForm'), { ssr: false });

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');

  const tenantId = (session.user as any).tenantId;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { emailConfigs: true },
  });

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Manage your company info and email configuration</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <h2 className="text-lg font-semibold">Company Information</h2>
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {tenant?.companyInfo || 'Not configured'}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Email Configuration</h2>
        {tenant?.emailConfigs[0] ? (
          <div className="p-4 bg-gray-50 rounded-lg space-y-2 text-sm">
            <p><strong>IMAP:</strong> {tenant.emailConfigs[0].imapHost}:{tenant.emailConfigs[0].imapPort}</p>
            <p><strong>SMTP:</strong> {tenant.emailConfigs[0].smtpHost}:{tenant.emailConfigs[0].smtpPort}</p>
            <p><strong>Last Polled:</strong> {tenant.emailConfigs[0].lastPolledAt?.toLocaleString() || 'Never'}</p>
          </div>
        ) : (
          <p className="text-gray-500">Not configured</p>
        )}
      </div>
    </div>
  );
}
```

---

### Task 16: Seed Script (First User + Default Columns)

**Files:**
- Create: `prisma/seed.ts`

- [ ] **Step 1: Write seed script**

```typescript
// prisma/seed.ts
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
  const board = await prisma.board.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: { title: 'Main Board', tenantId: tenant.id },
  });

  // Create default columns
  const defaultColumns = [
    { title: 'Unreads', position: 0, color: '#6b7280', isSystem: true },
    { title: 'Leads', position: 1, color: '#3b82f6', isSystem: false },
    { title: 'Follow up 1', position: 2, color: '#f59e0b', isSystem: false },
    { title: 'Follow up 2', position: 3, color: '#f59e0b', isSystem: false },
    { title: 'Follow up 3', position: 4, color: '#f59e0b', isSystem: false },
    { title: 'Fail', position: 5, color: '#ef4444', isSystem: false },
    { title: 'Pending', position: 6, color: '#8b5cf6', isSystem: false },
    { title: 'Success', position: 7, color: '#22c55e', isSystem: false },
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
```

Add to `package.json`:
```json
"prisma": {
  "seed": "tsx prisma/seed.ts"
}
```

---

### Task 17: API Routes (Cards, Columns, Drafts)

**Files:**
- Create: `src/server/api/cards/route.ts`
- Create: `src/server/api/columns/route.ts`
- Create: `src/server/api/drafts/[id]/route.ts`
- Create: `src/server/api/notifications/route.ts`

- [ ] **Step 1: Write cards API route**

```typescript
// src/server/api/cards/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const { searchParams } = new URL(req.url);
  const columnId = searchParams.get('columnId');

  const where: any = { tenantId };
  if (columnId) where.columnId = columnId;

  const cards = await prisma.card.findMany({
    where,
    orderBy: { lastActivityAt: 'desc' },
    include: { assignedTo: { select: { id: true, name: true, avatar: true } } },
  });

  return NextResponse.json(cards);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const body = await req.json();

  const card = await prisma.card.create({
    data: {
      subject: body.subject,
      fromEmail: body.fromEmail,
      fromName: body.fromName,
      bodyText: body.bodyText,
      columnId: body.columnId,
      tenantId,
      channel: body.channel || 'email',
    },
  });

  return NextResponse.json(card, { status: 201 });
}
```

```typescript
// src/app/api/cards/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const card = await prisma.card.findUnique({
    where: { id: params.id },
    include: {
      activityLogs: { orderBy: { createdAt: 'desc' } },
      drafts: { orderBy: { createdAt: 'desc' } },
      assignedTo: { select: { id: true, name: true } },
    },
  });

  if (!card || card.tenantId !== (session.user as any).tenantId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(card);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const body = await req.json();

  const card = await prisma.card.findUnique({ where: { id: params.id } });
  if (!card || card.tenantId !== tenantId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const updated = await prisma.card.update({
    where: { id: params.id },
    data: {
      columnId: body.columnId,
      status: body.status,
      highlighted: body.highlighted,
      assignedToId: body.assignedToId,
    },
  });

  return NextResponse.json(updated);
}
```

- [ ] **Step 2: Write columns API route**

```typescript
// src/app/api/columns/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const board = await prisma.board.findUnique({ where: { tenantId } });

  if (!board) return NextResponse.json([]);

  const columns = await prisma.column.findMany({
    where: { boardId: board.id },
    orderBy: { position: 'asc' },
    include: {
      cards: {
        orderBy: { lastActivityAt: 'desc' },
      },
    },
  });

  return NextResponse.json(columns);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const body = await req.json();

  const board = await prisma.board.findUnique({ where: { tenantId } });
  if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

  const column = await prisma.column.create({
    data: {
      title: body.title,
      position: body.position,
      color: body.color || '#6366f1',
      boardId: board.id,
    },
  });

  return NextResponse.json(column, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();

  // Bulk update columns (reorder, rename, delete)
  if (body.columns) {
    for (const col of body.columns) {
      await prisma.column.update({
        where: { id: col.id },
        data: { title: col.title, position: col.position, color: col.color },
      });
    }
  }

  if (body.deleteIds) {
    for (const id of body.deleteIds) {
      const col = await prisma.column.findUnique({ where: { id } });
      if (col && !col.isSystem) {
        await prisma.column.delete({ where: { id } });
      }
    }
  }

  return NextResponse.json({ success: true });
}
```

---

### Task 18: Nginx Config

**Files:**
- Create: `nginx.conf`

- [ ] **Step 1: Write Nginx config**

```nginx
# nginx.conf
server {
    listen 80;
    server_name crm.jetdigitalpro.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name crm.jetdigitalpro.com;

    ssl_certificate /etc/letsencrypt/live/crm.jetdigitalpro.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/crm.jetdigitalpro.com/privkey.pem;

    # Next.js web server
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support
    location /api/ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

---

### Task 19: Schedule Email Polling + Auto-Advance

**Files:**
- Create: `worker/scheduler.ts` (or add to existing worker)

- [ ] **Step 1: Write scheduler for recurring jobs**

```typescript
// worker/scheduler.ts
import cron from 'node-cron';
import prisma from '../src/lib/prisma';
import { emailPollQueue, autoAdvanceQueue } from '../queue';

export function startSchedulers() {
  // Poll all tenants' inboxes every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    console.log('[Scheduler] Starting email poll for all tenants...');

    const configs = await prisma.emailConfig.findMany({
      where: { isActive: true },
      select: { tenantId: true },
    });

    for (const config of configs) {
      await emailPollQueue.add('poll_inbox', {
        type: 'poll_inbox',
        tenantId: config.tenantId,
      });
    }

    console.log(`[Scheduler] Queued ${configs.length} poll jobs`);
  });

  // Check auto-advance every hour
  cron.schedule('0 * * * *', async () => {
    console.log('[Scheduler] Checking auto-advance...');

    const staleCards = await prisma.card.findMany({
      where: {
        highlighted: false,
        nextFollowUpAt: { lte: new Date() },
        column: {
          title: { startsWith: 'Follow up' },
        },
      },
      select: { id: true, tenantId: true },
    });

    for (const card of staleCards) {
      await autoAdvanceQueue.add('advance_card', {
        type: 'advance_card',
        tenantId: card.tenantId,
        cardId: card.id,
      });
    }
  });

  console.log('[Scheduler] Cron jobs registered');
}
```

Modify `worker/index.ts` to call `startSchedulers()` at startup.

---

### Task 20: First Build & Test

- [ ] **Step 1: Run build**

Run: `cd "D:/Claude Cowork/Kanban-CRM" && npm run build`
Expected: Next.js builds without errors

- [ ] **Step 2: Run database seed**

Run: `npx prisma db seed`
Expected: Admin user and default columns created

- [ ] **Step 3: Start development server**

Run: `npm run dev`
Open: http://localhost:3000/login
Expected: Login page renders

- [ ] **Step 4: Verify login flow**

1. Open http://localhost:3000/login
2. Login with admin@jetdigitalpro.com / admin123
3. Expected: Redirect to /dashboard with empty Kanban board

- [ ] **Step 5: Verify setup redirect**

1. First login should redirect to /setup
2. Fill company info → Next → Fill email config → Save
3. Expected: Email config saved, then redirect to /dashboard
