export interface EmailPollJob {
  type: 'poll_inbox';
  tenantId: string;
  emailConfigId: string;
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
  currentColumnId?: string;
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

export interface OutreachDispatchJob {
  type: 'outreach_dispatch';
  tenantId: string;
  leadId: string;
}

export interface OutreachScrapeJob {
  type: 'outreach_scrape';
  tenantId: string;
  campaignId: string;
  query?: string;
  role?: string;
  location?: string;
  industry?: string;
  limit: number;
  provider?: 'apify' | 'outscraper';
  apiToken?: string;
}

export interface OutreachVerifyJob {
  type: 'outreach_verify_batch';
  tenantId: string;
  campaignId: string;
  leadIds?: string[];
  reoonApiKey?: string;
}

