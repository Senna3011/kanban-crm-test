import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  const tenantId = searchParams.get('t');

  if (!email || !tenantId) {
    return NextResponse.json({ error: 'Invalid unsubscribe link parameters.' }, { status: 400 });
  }

  try {
    await prisma.outreachSuppression.upsert({
      where: {
        tenantId_email: {
          tenantId,
          email: email.trim().toLowerCase(),
        },
      },
      update: {
        reason: 'UNSUBSCRIBED_ONE_CLICK',
      },
      create: {
        email: email.trim().toLowerCase(),
        reason: 'UNSUBSCRIBED_ONE_CLICK',
        tenantId,
      },
    });

    return NextResponse.json({ success: true, message: 'Unsubscribed successfully.' });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  const tenantId = searchParams.get('t');

  if (!email || !tenantId) {
    return new NextResponse('Invalid unsubscribe link parameters.', { status: 400 });
  }

  try {
    await prisma.outreachSuppression.upsert({
      where: {
        tenantId_email: {
          tenantId,
          email: email.trim().toLowerCase(),
        },
      },
      update: {
        reason: 'UNSUBSCRIBED',
      },
      create: {
        email: email.trim().toLowerCase(),
        reason: 'UNSUBSCRIBED',
        tenantId,
      },
    });

    return new NextResponse(
      `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Unsubscribed Successfully</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background-color: #f8fafc; }
          .card { background: white; padding: 40px; border-radius: 16px; border: 1px solid #e2e8f0; text-align: center; max-width: 420px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
          .icon { font-size: 40px; margin-bottom: 16px; }
          h1 { font-size: 20px; color: #0f172a; margin-bottom: 8px; }
          p { font-size: 14px; color: #64748b; line-height: 1.5; margin: 0; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✅</div>
          <h1>Unsubscribed Successfully</h1>
          <p>The email address <strong>${email}</strong> has been removed from our outbound list. You will not receive further outreach communications from us.</p>
        </div>
      </body>
      </html>`,
      {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    );
  } catch (error) {
    return new NextResponse('An error occurred while processing your request.', { status: 500 });
  }
}
