# Kanban Outreach User Guide

A step-by-step guide on how to configure your outreach sender accounts, find leads, verify emails, write AI personalized cold messages, and send campaigns directly to your Kanban CRM pipeline.

---

## 1. Overview of the Outreach Funnel

```
0. Account Setup     1. Sourcing          2. Verification        3. AI Drafting         4. Dispatch            5. CRM Conversion
┌────────────────┐   ┌────────────────┐   ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│ Configure Mail │──>│ Search Leads   │──>│ Verify Mailbox   │──>│ Generate Copy    │──>│ Send Cold Email  │──>│ Auto Card in     │
│ & API Settings │   │ on LinkedIn    │   │ (Safe/Risky)     │   │ with Pesat AI    │   │ (Batch or Single)│   │ Kanban Board     │
└────────────────┘   └────────────────┘   └──────────────────┘   └──────────────────┘   └──────────────────┘   └──────────────────┘
```

---

## 2. Step-by-Step Instructions

### Step 0: Configure Outreach Sender Accounts & API Keys (Settings)
Before creating campaigns, set up your dedicated sender mailbox and integration keys:
1. Open the sidebar and click **🚀 Outreach**, then click **`⚙️ Account Settings`** (or go to `/dashboard/outreach/settings`).
2. Configure your outbound sender mailbox:
   - **Sender Name & Email**: The name and address your prospects will see (e.g., *Sarah Miller <outreach@yourcompany.com>*).
   - **SMTP Credentials**: Set your host (`smtp.zoho.com`, `smtp.gmail.com`), port (`465` SSL / `587` TLS), user, and password.
   - **Daily Limit**: Choose a safe daily email threshold (e.g., `50` to `100` emails/day) to safeguard your sender reputation.
   - **API Keys (Optional)**: Enter your **Apify API Token** for live LinkedIn profile sourcing and **Reoon API Key** for deliverability verification.
3. Click **`Test SMTP Connection`** to ensure your credentials are valid, then click **`Save Outreach Account`**.

---

### Step 1: Create a New Campaign & Select Sender Mailbox
1. From the **🚀 Outreach** dashboard, click the **`+ Create New Campaign`** button.
2. Fill in your target market and sender details:
   - **Campaign Name**: A recognizable title (e.g., *Q4 Fintech Founders Jakarta*).
   - **Sender Mailbox**: Select which connected mailbox account will send this campaign's emails.
   - **Target Job Title / Role**: Enter target decision-maker titles (e.g., *CEO*, *Founder*, *VP Engineering*).
   - **Target Geographic Location**: Enter city or country (e.g., *Singapore*, *Jakarta*, *United States*).
   - **Target Industry**: Enter the industry niche (e.g., *Financial Services*, *SaaS*, *Healthcare*).
   - **Initial Prospect Count**: Choose 5, 10, 25, or 50 leads.
   - **AI Instructions**: Add custom guidelines on what value or offer the AI should mention.
3. Click **`Create Campaign & Source Leads →`**.

---

### Step 2: Review Sourced Leads & Verify Mailboxes
Once redirected to the Campaign Workspace:
1. Scroll down to the **Lead Staging & Deliverability Matrix** table.
2. Click the **`🔗`** icon next to any prospect name to view their live LinkedIn profile.
3. Click **`🛡️ Verify Mailboxes`** in the top toolbar to check deliverability:
   - 🟢 **Safe (92%–98%)**: Valid email, safe to send.
   - 🟡 **Risky**: Catch-all mailbox, proceed with caution.
   - 🔴 **Invalid**: Non-deliverable email, excluded to protect domain reputation.

---

### Step 3: Generate & Review AI Personalized Drafts
1. Click **`🤖 Generate AI Drafts`** in the top toolbar to write emails for all leads, or click **`🤖 Draft`** on a specific row.
2. Click **`Review / Test`** on any row to open the email preview modal.
3. Inside the modal, you can:
   - Edit the **Subject Line** or **Email Body**.
   - Change the **Recipient Target Email** to your personal email to test real delivery.
   - Click **`Save Draft`** or **`🚀 Send Live to this Lead`**.

---

### Step 4: Dispatch Campaign Emails
- **Batch Send**: Click **`✉️ Dispatch Emails`** in the top toolbar to send to all verified leads with ready drafts.
- **Single Send**: Click **`✉️ Send`** on an individual row to dispatch only to that contact.
- Each email automatically includes:
  - Personalized copy matching the prospect's profile.
  - A secure one-click **Unsubscribe** link.
  - Automatic throttling (1.5-second stagger) to prevent spam flagging.

---

### Step 5: Convert Leads to Kanban CRM
- **Automatic**: When a prospect replies to your email, the system automatically creates a new Card in the **"Leads"** column of your Kanban Board.
- **Manual**: Click **`+ Push to CRM`** on any row to instantly move a high-priority prospect to the Kanban Board.

---

## 3. Quick Actions Reference

| Button / Feature | What It Does |
| :--- | :--- |
| **`⚙️ Account Settings`** | Configure sender email accounts, SMTP credentials, daily sending limits, and Apify/Reoon API tokens. |
| **`⚡ Test Send to My Email`** | Dispatches an instant test email directly to your inbox without affecting campaign leads. |
| **`➕ Add Custom Lead`** | Manually adds a specific person and email address with automatic AI draft generation. |
| **`🔍 Source More`** | Finds 10 additional live LinkedIn profiles matching your campaign criteria. |
| **`📊 Export CSV`** | Downloads the entire campaign lead list and drafts into an Excel/CSV spreadsheet. |
| **`+ Push to CRM`** | Converts the lead into a Kanban CRM card with full outreach conversation history. |
