import { NextRequest } from 'next/server';
import { appEventBus, AppSSEEvent } from '@/lib/events';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get('tenantId');

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(encoder.encode('event: connected\ndata: {"status":"ok"}\n\n'));

      // Event listener
      const onEvent = (event: AppSSEEvent) => {
        try {
          if (!event.tenantId || !tenantId || event.tenantId === tenantId) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          }
        } catch {
          // Stream might be closed
        }
      };

      appEventBus.on('event', onEvent);

      // Keep connection alive with heartbeats
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 25000);

      // Clean up on close
      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        appEventBus.off('event', onEvent);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
