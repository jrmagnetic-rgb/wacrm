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
      .select('instagram_user_id, access_token, status, updated_at')
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
        { ok: false, step: 'config', error: 'Nenhuma configuração do Instagram encontrada.' },
        { status: 404 }
      )
    }

    const response = await fetch(
      `https://graph.instagram.com/v26.0/${encodeURIComponent(config.instagram_user_id)}/subscribed_apps`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.access_token}`,
        },
        cache: 'no-store',
      }
    )

    const result = await response.json()

    return NextResponse.json({
      ok: response.ok,
      instagram_user_id: config.instagram_user_id,
      config_status: config.status,
      meta_status: response.status,
      meta_response: result,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        step: 'unexpected',
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
