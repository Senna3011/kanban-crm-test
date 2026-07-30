# Kanban CRM — Design Specification

**Date:** 2026-07-30
**Status:** Approved
**Stack:** Next.js 14 + BullMQ + PostgreSQL + DeepSeek AI

---

## 1. Product Overview

A multi-tenant Kanban-based CRM web app that automatically processes inbound emails (and future channels: Slack, WhatsApp, Telegram, Discord), uses AI to classify leads, drafts follow-ups, and manages multi-channel outreach campaigns via a drag-and-drop Kanban board.

**Live at:** `https://crm.jetdigitalpro.com`

---

## 2. Architecture

### 2.1 High-Level Diagram

```
                    ┌──────────────────────┐
                    │   Nginx (Reverse Proxy)│
                    └──────────┬───────────┘
                               │
              ┌────────────────┴────────────────┐
              │         Next.js Server           │
              │  ┌─────────┐ ┌────────────────┐ │
              │  │ Frontend │ │  API Routes    │ │
              │  │ (React)  │ │  /api/*        │ │
              │  └────┬────┘ └───────┬────────┘ │
              └───────┼──────────────┼──────────┘
                      │              │
              ┌───────┴──────────────┴──────────┐
              │         PostgreSQL                │
              │         + Redis (BullMQ)          │
              └────────────────┬─────────────────┘
                               │
              ┌────────────────┴─────────────────┐
              │         Worker Process (PM2)       │
              │  ┌──────────┐ ┌─────────────────┐  │
              │  │ IMAP     │ │ AI Processor    │  │
              │  │ Poller   │ │ (DeepSeek API)  │  │
              │  └──────────┘ └─────────────────┘  │
              │  ┌──────────────────────────────┐  │
              │  │ Channel Adapters             │  │
              │  │ Email │ Slack │ WA │ TG │ DC │  │
              │  └──────────────────────────────┘  │
              │  ┌──────────┐ ┌─────────────────┐  │
              │  │ Auto-    │ │ Notification    │  │
              │  │ advance  │ │ Engine          │  │
              │  └──────────┘ └─────────────────┘  │
              └────────────────────────────────────┘
```

### 2.2 Services

| Service | Tech | Port | PM2 Name |
|---------|------|------|----------|
| Web Server | Next.js 14 | 3000 | `web` |
| Worker | Standalone Node.js | - | `worker` |
| Nginx | Reverse proxy | 443/80 | - |
| PostgreSQL | Database | 5432 | - |
| Redis | Job queue | 6379 | - |

### 2.3 Channel Adapter Interface

```typescript
interface ChannelAdapter {
  readonly channel: ChannelType; // 'email' | 'slack' | 'whatsapp' | 'telegram' | 'discord'
  
  // Inbound
  pollInbox(connection: ChannelConnection): Promise<InboundMessage[]>;
  
  // Outbound
  sendMessage(params: SendParams): Promise<SendResult>;
  
  // Status check
  getStatus(messageId: string): Promise<MessageStatus>;
}

type ChannelType = 'email' | 'slack' | 'whatsapp' | 'telegram' | 'discord';
```

**Current scope (Phase 1):** Email only (IMAP/SMTP). All channels share the same data model.

---

## 3. Data Model

### 3.1 Entity Relationship

```
Tenant
  ├── Workspace (one per tenant)
  │     ├── User (admins/members)
  │     ├── Board (the Kanban board)
  │     │     ├── Column (e.g., Unreads, Leads, Follow up 1...)
  │     │     │     └── Card (each email/conversation)
  │     │     │           ├── ActivityLog (email + AI + user actions)
  │     │     │           └── DraftMessage (AI-prepared replies)
  │     ├── EmailConfig (IMAP/SMTP credentials)
  │     ├── ChannelConfig (future: Slack, WA, etc.)
  │     └── Contact (normalized contacts extracted from emails)
```

### 3.2 Key Tables (Prisma Schema)

**`Tenant`** — Multi-tenant root
- `id`, `name`, `subdomain`, `createdAt`

**`User`** — Auth users
- `id`, `email`, `name`, `passwordHash`, `role` (admin/member)
- `tenantId` → Tenant

**`EmailConfig`** — Per-tenant email connection
- `id`, `tenantId`
- `imapHost`, `imapPort`, `imapUser`, `imapPass` (encrypted)
- `smtpHost`, `smtpPort`, `smtpUser`, `smtpPass` (encrypted)
- `lastPolledAt`, `isActive`

**`Column`** — Kanban columns (user-configurable)
- `id`, `boardId`, `title`, `position`, `color`
- `type` (system/normal) — system columns cannot be deleted
- Default: Unreads | Leads | Follow up 1 | Follow up 2 | Follow up 3 | Fail | Pending | Success

**`Card`** — Each email/conversation
- `id`, `columnId`, `tenantId`
- `subject`, `fromEmail`, `fromName`, `body` (plain + HTML)
- `messageId` (original email Message-ID), `inReplyTo`
- `status` (read/unread/followed-up)
- `assignedTo` → User? (optional assignment)
- `lastActivityAt`, `nextFollowUpAt`, `createdAt`
- `metadata` (JSON — AI classification result, channel info)

**`ActivityLog`** — Full audit trail
- `id`, `cardId`, `tenantId`
- `type` (email_received | email_sent | ai_classified | ai_drafted | user_sent | user_edited | user_moved | system_advanced)
- `content` (JSON — message body, AI reasoning, etc.)
- `actor` (email | ai | user:{userId})

**`DraftMessage`** — AI-prepared follow-up drafts
- `id`, `cardId`, `tenantId`
- `channel` (email/slack/wa/telegram/discord)
- `subject`, `body`
- `status` (pending | approved | sent | edited)
- `aiGeneratedAt`, `sentAt`, `editedAt`

**`Notification`** — In-app notifications
- `id`, `tenantId`, `userId`, `cardId?`
- `type`, `title`, `body`, `isRead`, `createdAt`

---

## 4. Kanban Board Logic

### 4.1 Default Columns & Flow

```
┌────────┐   ┌───────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌──────┐   ┌─────────┐   ┌─────────┐
│Unreads │──▶│ Leads │──▶│Follow up 1│──▶│Follow up 2│──▶│Follow up 3│──▶│ Fail │──▶│ Pending │──▶│ Success │
└────────┘   └───────┘   └───────────┘   └───────────┘   └───────────┘   └──────┘   └─────────┘   └─────────┘
  (auto)       (AI       (AI drafts,  (AI drafts,     (AI drafts,       (dead)   (waiting    (converted/
               classifies user sends)  user sends)     user sends)                response)   closed)
               as lead)                                                                                
```

### 4.2 Auto-Advance Rules

1. **New email arrives** → `Unreads`
2. AI classifies → jika lead → `Leads`; jika bukan → `Fail`
3. AI drafts follow-up for `Leads` → user reviews/sends
4. **User sends follow-up** → card moves to next list (Follow up 1 → 2 → 3)
5. **Auto-advance timer** — jika X hari tanpa reply, card auto-advance ke list berikutnya
6. **Reply received** → card di **highlight warna kontras** (terlepas dari list mana), notif muncul
7. **User marks success** → drag ke `Success`
8. **Dead lead** → drag ke `Fail`

### 4.3 Column Flexibility

- User bisa **add, rename, reorder, delete** columns (kecuali system columns)
- System columns: `Unreads` (wajib) dan `Fail`/`Success` (opsional)
- Save order di `position` field

---

## 5. AI Integration (DeepSeek API)

### 5.1 AI Tasks

| Task | Model | Trigger | Description |
|------|-------|---------|-------------|
| **Lead Classification** | deepseek-chat | Inbound email received | Classify: is this a lead? extract name, company, interest level |
| **Draft Follow-up** | deepseek-chat | Card enters Leads / Follow-up N | Generate email draft based on conversation history |
| **Smart Reply** | deepseek-chat | Reply received | Generate suggested reply referencing context |
| **Summarize** | deepseek-chat | On demand | Summarize long thread |

### 5.2 Prompt Engineering

**Lead classification prompt:**
```
You are a CRM AI. Classify this inbound email:
Company context: [tenant.companyInfo]
Products/Services: [tenant.products]

From: [fromName] <[fromEmail]>
Subject: [subject]
Body: [body]

Respond in JSON:
{
  "isLead": true/false,
  "confidence": 0-100,
  "reason": "why",
  "extractedCompany": "...",
  "interestLevel": "high/medium/low",
  "suggestedColumn": "Leads"
}
```

**Follow-up draft prompt:**
```
You are a sales assistant. Write a follow-up email for this lead:

Lead: [fromName], [fromEmail]
Company mentioned: [extractedCompany]
Interest level: [interestLevel]

Conversation history:
[thread history]

Previous follow-ups sent:
[list]

Rules:
- Keep under 150 words
- Professional but not pushy
- Include a clear CTA
- Reference previous conversation
```

---

## 6. Email Pipeline

### 6.1 Inbound Flow

```
IMAP Poller (Worker Process)
  │
  ├── 1. Connect via IMAP (credentials from EmailConfig)
  ├── 2. Fetch unseen emails since lastPolledAt
  ├── 3. For each email:
  │     ├── a. Check if it's a reply (inReplyTo header)
  │     │     ├── YES → Find existing card, append to its thread
  │     │     │           → Highlight card, create ActivityLog
  │     │     │           → AI generates smart reply → save as DraftMessage
  │     │     └── NO  → Create new Card in "Unreads" column
  │     │               → AI classifies
  │     │               → AI drafts first follow-up
  │     └── b. Save ActivityLog (email_received)
  └── 4. Update lastPolledAt
```

### 6.2 Outbound Flow

```
User clicks "Send" on a DraftMessage
  │
  ├── 1. Mark draft as "sent"
  ├── 2. Send via SMTP (nodemailer + SMTP credentials)
  ├── 3. Create ActivityLog (email_sent)
  ├── 4. Create ActivityLog (ai_drafted → user_sent)
  ├── 5. Auto-advance card to next Follow-up column
  └── 6. Schedule next auto-advance (timer)
```

### 6.3 Provider Support (Generic IMAP/SMTP)

Support any provider via manual config:
- **Gmail** — App Password required
- **Zoho** — SMTP: smtp.zoho.com, IMAP: imap.zoho.com
- **Outlook/Office365** — SMTP: smtp.office365.com, IMAP: outlook.office365.com
- **Custom domain** — any standard IMAP/SMTP server

Connection test before saving config.

---

## 7. Frontend Pages & Features

### 7.1 Page Structure

```
/login                    — Login page (NextAuth)
/setup                    — Company info + email config wizard
/dashboard                — Kanban board (main view)
/dashboard/settings       — Tenant settings (team, email, channels)
/dashboard/analytics      — Basic stats (future)
```

### 7.2 Kanban Board UI

- **Drag & drop** cards between columns (`@dnd-kit`)
- **Card detail** — click card → panel/slide-over:
  - Email body (full thread)
  - Activity log (cronologis: email + AI + user actions)
  - Draft message (AI-generated, editable, Send button)
  - Manual reply textarea
- **Column management** — add/rename/reorder/delete columns
- **Card highlight** — replies get contrasting color/badge
- **Search/filter** — by subject, from, date (future)
- **Assigned user** — avatar per card (future)

### 7.3 Real-time Updates

- WebSocket atau SSE untuk:
  - New card muncul otomatis (unreads)
  - Card highlight tanpa reload
  - Notification badge update

---

## 8. Notification System

| Event | In-app | Email |
|-------|--------|-------|
| New lead detected | ✅ Badge + highlight | ✅ (opsional) |
| Reply received | ✅ Badge + card highlight | ✅ Email ke user |
| Follow-up pending | ✅ Reminder badge | ✅ Daily digest |
| Draft ready for review | ✅ Badge | — |
| Auto-advance occurred | ✅ Activity log entry | — |

---

## 9. Deployment (crm.jetdigitalpro.com)

| Component | Setup |
|-----------|-------|
| VPS | DigitalOcean / Linode / VPS ada |
| Web | PM2: `next start` on port 3000 |
| Worker | PM2: `node worker/index.js` |
| Nginx | Reverse proxy 443 → 3000, SSL (Let's Encrypt) |
| PostgreSQL | Local install atau Docker |
| Redis | Local install atau Docker |
| Domain | `crm.jetdigitalpro.com` → VPS IP |

### PM2 Ecosystem

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      env: { PORT: 3000, NODE_ENV: 'production' }
    },
    {
      name: 'worker',
      script: 'worker/index.js',
      env: { NODE_ENV: 'production' }
    }
  ]
};
```

---

## 10. Future-Proofing (Multi-Channel)

Design ensures minimal friction to add channels:

1. Implement `ChannelAdapter` interface
2. Create table `ChannelConfig` (polymorphic — one row per channel per tenant)
3. Worker polls each configured channel
4. Cards store `channel` field to identify origin

**Phase 2+ candidates:**
- Slack: Slack Events API (inbound) + Web API (outbound)
- WhatsApp: Meta WABA (Cloud API) via webhook
- Telegram: Bot API polling
- Discord: Bot via Gateway API

---

## 11. Tech Stack Summary

| Category | Technology |
|----------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript strict |
| UI | Tailwind CSS + Radix UI + @dnd-kit |
| ORM | Prisma |
| Database | PostgreSQL 15+ |
| Queue | BullMQ + Redis |
| Auth | NextAuth.js (credentials + OAuth) |
| AI | DeepSeek API (deepseek-chat) |
| Email IMAP | `node-imap` / `mailparser` |
| Email SMTP | `nodemailer` |
| Real-time | WebSocket (via `ws` or Socket.io) |
| Worker | BullMQ Worker (separate process) |
| Deploy | PM2 + Nginx + Let's Encrypt SSL |

---

*This spec is approved on 2026-07-30 and transitions to implementation planning.*
