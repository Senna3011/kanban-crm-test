import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyUnsubscribeSignature } from '@/lib/outreach-signature';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  const tenantId = searchParams.get('t');
  const signature = searchParams.get('sig');

  if (!email || !tenantId || !signature || !verifyUnsubscribeSignature(email, tenantId, signature)) {
    return NextResponse.json({ error: 'Invalid or unauthorized unsubscribe link.' }, { status: 403 });
  }

  try {
    const isOneClick = req.headers.get('list-unsubscribe-post') === 'List-Unsubscribe=One-Click';

    await prisma.outreachSuppression.upsert({
      where: {
        tenantId_email: {
          tenantId,
          email: email.trim().toLowerCase(),
        },
      },
      update: {
        reason: isOneClick ? 'UNSUBSCRIBED_ONE_CLICK' : 'UNSUBSCRIBED',
      },
      create: {
        email: email.trim().toLowerCase(),
        reason: isOneClick ? 'UNSUBSCRIBED_ONE_CLICK' : 'UNSUBSCRIBED',
        tenantId,
      },
    });

    const isHtml = req.headers.get('accept')?.includes('text/html') || req.headers.get('content-type')?.includes('application/x-www-form-urlencoded');
    if (isHtml) {
      const safeEmail = escapeHtml(email);
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
            <p>The email address <strong>${safeEmail}</strong> has been removed from our outbound list. You will not receive further outreach communications from us.</p>
          </div>
        </body>
        </html>`,
        {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }
      );
    }

    return NextResponse.json({ success: true, message: 'Unsubscribed successfully.' });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  const tenantId = searchParams.get('t');
  const signature = searchParams.get('sig');

  if (!email || !tenantId || !signature || !verifyUnsubscribeSignature(email, tenantId, signature)) {
    return new NextResponse('Invalid or unauthorized unsubscribe link.', { status: 403 });
  }

  const safeEmail = escapeHtml(email);

  // Render confirmation landing page.
  // Security scanners/crawlers performing GET will NOT mutate the suppression list.
  return new NextResponse(
    `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Unsubscribe Confirmation</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background-color: #f8fafc; }
        .card { background: white; padding: 40px; border-radius: 16px; border: 1px solid #e2e8f0; text-align: center; max-width: 440px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
        .icon { font-size: 40px; margin-bottom: 16px; }
        h1 { font-size: 20px; color: #0f172a; margin-bottom: 8px; }
        p { font-size: 14px; color: #64748b; line-height: 1.5; margin: 0 0 24px 0; }
        button { background: #ef4444; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; transition: background 0.2s; }
        button:hover { background: #dc2626; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">✉️</div>
        <h1>Unsubscribe Confirmation</h1>
        <p>Please confirm that you want to unsubscribe <strong>${safeEmail}</strong> from receiving outreach emails.</p>
        <form method="POST">
          <button type="submit">Confirm Unsubscribe</button>
        </form>
      </div>
    </body>
    </html>`,
    {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }
  );
}
