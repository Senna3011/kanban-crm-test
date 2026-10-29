import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth';
import { appEventBus, AppSSEEvent } from '@/lib/events';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const sessionTenantId = (session.user as any).tenantId;
  if (!sessionTenantId) {
    return new Response('Forbidden: No tenant associated with session.', { status: 403 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(encoder.encode('event: connected\ndata: {"status":"ok"}\n\n'));

      // Event listener scoped strictly to session tenantId
      const onEvent = (event: AppSSEEvent) => {
        try {
          if (event.tenantId === sessionTenantId) {
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
