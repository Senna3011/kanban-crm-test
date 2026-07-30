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
