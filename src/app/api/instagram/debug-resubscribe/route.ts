import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: config, error: configError } = await supabase
      .from('instagram_config')
      .select('instagram_user_id, access_token, status')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (configError) {
      return NextResponse.json(
        { ok: false, step: 'supabase', error: configError.message },
        { status: 500 }
      )
    }

    if (!config) {
      return NextResponse.json(
        { ok: false, step: 'config', error: 'Nenhuma conta Instagram conectada.' },
        { status: 404 }
      )
    }

    const url =
      `https://graph.instagram.com/v26.0/${encodeURIComponent(config.instagram_user_id)}/subscribed_apps`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subscribed_fields: 'messages',
      }),
      cache: 'no-store',
    })

    const text = await response.text()

    let metaResponse: unknown

    try {
      metaResponse = JSON.parse(text)
    } catch {
      metaResponse = { raw: text }
    }

    return NextResponse.json({
      ok: response.ok,
      instagram_user_id: config.instagram_user_id,
      config_status: config.status,
      meta_status: response.status,
      meta_response: metaResponse,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
