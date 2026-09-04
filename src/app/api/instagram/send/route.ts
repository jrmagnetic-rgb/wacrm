import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { sendInstagramTextMessage } from '@/lib/instagram/instagram-api'

let _adminClient: any = null

function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }

  return _adminClient
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Não autenticado.' },
        { status: 401 }
      )
    }

    const body = await request.json()

    const recipientId = String(body?.recipientId || '').trim()
    const text = String(body?.text || '').trim()

    if (!recipientId || !text) {
      return NextResponse.json(
        { error: 'recipientId e text são obrigatórios.' },
        { status: 400 }
      )
    }

    const admin = supabaseAdmin()

    const { data: config, error: configError } = await admin
      .from('instagram_config')
      .select('instagram_user_id, access_token, status')
      .eq('user_id', user.id)
      .maybeSingle()

    if (configError) {
      console.error('[instagram/send] config lookup failed:', configError)
      return NextResponse.json(
        { error: 'Não foi possível carregar a configuração do Instagram.' },
        { status: 500 }
      )
    }

    if (!config) {
      return NextResponse.json(
        { error: 'Instagram não configurado.' },
        { status: 400 }
      )
    }

    if (config.status !== 'connected') {
      return NextResponse.json(
        { error: 'Instagram não está conectado.' },
        { status: 400 }
      )
    }

    const result = await sendInstagramTextMessage({
      accessToken: config.access_token,
      instagramUserId: config.instagram_user_id,
      recipientId,
      text,
    })

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
    })
  } catch (error) {
    console.error('[instagram/send] failed:', error)

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Erro ao enviar mensagem pelo Instagram.',
      },
      { status: 500 }
    )
  }
}
