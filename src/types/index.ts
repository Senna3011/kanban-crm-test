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
  assignedTo?: {
    id: string;
    name: string | null;
    avatar: string | null;
    email?: string;
  } | null;
  lastActivityAt: string;
  nextFollowUpAt: string | null;
  metadata: any;
  createdAt: string;
  /** Number of distinct email cards in this conversation thread */
  threadCount?: number;
  /** Whether the card has a description/body */
  descLen?: number;
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
  uid?: number;
  isRead?: boolean;
  inReplyTo?: string;
  fromEmail: string;
  fromName?: string;
  toEmail?: string;
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
