import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey || apiKey === 'sk-your-deepseek-api-key' || apiKey.startsWith('sk-your')) {
    return NextResponse.json({
      configured: false,
      message: 'DeepSeek API key belum dikonfigurasi. AI classification & draft generation tidak akan jalan.',
    });
  }

  // Test the API key with a minimal request
  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
    });

    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({
        configured: true,
        valid: false,
        message: 'DeepSeek API key tidak valid atau sudah expired. Harap update di server .env → DEEPSEEK_API_KEY',
      });
    }

    if (res.status === 402) {
      return NextResponse.json({
        configured: true,
        valid: false,
        message: 'DeepSeek token sudah habis (quota exceeded). Harap top up di deepseek.com',
      });
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({
        configured: true,
        valid: false,
        message: `DeepSeek API error (${res.status}): ${err.error?.message || 'Unknown error'}`,
      });
    }

    return NextResponse.json({
      configured: true,
      valid: true,
      message: 'DeepSeek API active — AI classification & draft generation running.',
    });
  } catch (e: any) {
    return NextResponse.json({
      configured: true,
      valid: false,
      message: `DeepSeek API unreachable: ${e.message}`,
    });
  }
}
