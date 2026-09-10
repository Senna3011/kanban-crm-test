import { EventEmitter } from 'events';

// Global EventEmitter for server-sent events across Next.js API routes
const globalForEvents = globalThis as unknown as { appEventBus?: EventEmitter };

export const appEventBus = globalForEvents.appEventBus || new EventEmitter();
appEventBus.setMaxListeners(100);

if (process.env.NODE_ENV !== 'production') {
  globalForEvents.appEventBus = appEventBus;
}

export interface AppSSEEvent {
  type: 'card_updated' | 'notification' | 'refresh';
  tenantId?: string;
  data?: any;
}

export function broadcastAppEvent(event: AppSSEEvent) {
  try {
    appEventBus.emit('event', event);
  } catch (err: any) {
    console.error(`[EventBus] Broadcast error: ${err?.message}`);
  }
}
