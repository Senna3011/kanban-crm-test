import type { InboundMessage, SendParams, SendResult } from '../src/types';

export interface ChannelAdapter {
  readonly channel: string;

  /** Poll for new inbound messages */
  pollInbox(config: Record<string, string>): Promise<InboundMessage[]>;

  /** Send an outbound message */
  sendMessage(params: SendParams, config: Record<string, string>): Promise<SendResult>;

  /** Verify that the connection config is valid */
  testConnection(config: Record<string, string>): Promise<{ success: boolean; error?: string }>;
}
