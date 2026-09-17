import { NextResponse } from 'next/server';
import { getAIConfig } from '@/lib/ai';

export async function GET() {
  const { apiKey, endpoint, model } = getAIConfig();
  const isDeepSeek = !process.env.AI_API_KEY && !!process.env.DEEPSEEK_API_KEY;
  const providerName = isDeepSeek ? 'DeepSeek' : 'Custom AI (' + model + ')';

  if (!apiKey || apiKey === 'sk-your-deepseek-api-key' || apiKey.startsWith('sk-your')) {
    return NextResponse.json({
      configured: false,
      message: providerName + ' API key is not configured. AI classification and automated drafting are paused.',
    });
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
    });

    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({
        configured: true,
        valid: false,
        message: providerName + ' API key is invalid or expired.',
      });
    }

    if (res.status === 402) {
      return NextResponse.json({
        configured: true,
        valid: false,
        message: providerName + ' quota exceeded. Please top up token balance.',
      });
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({
        configured: true,
        valid: false,
        message: providerName + ' API error (' + res.status + '): ' + (err.error?.message || 'Unknown error'),
      });
    }

    return NextResponse.json({
      configured: true,
      valid: true,
      message: providerName + ' API active — AI classification & draft generation running.',
    });
  } catch (e: any) {
    return NextResponse.json({
      configured: true,
      valid: false,
      message: providerName + ' API unreachable: ' + e.message,
    });
  }
}
