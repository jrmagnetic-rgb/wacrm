import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const recipientId = searchParams.get('recipient_id')
    const text = searchParams.get('text') || 'Teste WACRM Instagram'

    if (!recipientId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Informe recipient_id na URL.',
        },
        { status: 400 }
      )
    }

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
        {
          ok: false,
          step: 'supabase',
          error: configError.message,
        },
        { status: 500 }
      )
    }

    if (!config) {
      return NextResponse.json(
        {
          ok: false,
          step: 'config',
          error: 'Nenhuma conta Instagram conectada.',
        },
        { status: 404 }
      )
    }

    const response = await fetch(
      `https://graph.instagram.com/v26.0/me/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: {
            id: recipientId,
          },
          message: {
            text,
          },
        }),
        cache: 'no-store',
      }
    )

    const responseText = await response.text()

    let metaResponse: unknown

    try {
      metaResponse = JSON.parse(responseText)
    } catch {
      metaResponse = { raw: responseText }
    }

    return NextResponse.json({
      ok: response.ok,
      meta_status: response.status,
      instagram_user_id: config.instagram_user_id,
      recipient_id: recipientId,
      meta_response: metaResponse,
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
