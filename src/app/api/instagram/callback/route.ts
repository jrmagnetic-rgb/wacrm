import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const error = url.searchParams.get('error')

    if (error) {
      return NextResponse.redirect(
        new URL(
          `/dashboard/settings?instagram_error=${encodeURIComponent(error)}`,
          'https://wacrm.delivery73.com'
        )
      )
    }

    if (!code || !state) {
      return NextResponse.json(
        { error: 'Código ou state não informado pela Meta.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(
        new URL('/login', 'https://wacrm.delivery73.com')
      )
    }

    const cookies = request.headers.get('cookie') || ''

    const stateCookie = cookies
      .split(';')
      .map((item) => item.trim())
      .find((item) => item.startsWith('instagram_oauth_state='))
      ?.split('=')
      .slice(1)
      .join('=')

    if (!stateCookie || stateCookie !== state) {
      return NextResponse.json(
        { error: 'State OAuth inválido ou expirado.' },
        { status: 400 }
      )
    }

    const appId = process.env.INSTAGRAM_APP_ID
    const appSecret = process.env.INSTAGRAM_APP_SECRET
    const redirectUri = process.env.INSTAGRAM_REDIRECT_URI

    if (!appId || !appSecret || !redirectUri) {
      return NextResponse.json(
        { error: 'Instagram OAuth não está configurado no servidor.' },
        { status: 500 }
      )
    }

    const tokenResponse = await fetch(
      'https://api.instagram.com/oauth/access_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
          code,
        }),
        cache: 'no-store',
      }
    )

    const tokenResult = await tokenResponse.json().catch(() => null)

    if (!tokenResponse.ok) {
      console.error(
        '[instagram/callback] token exchange failed:',
        tokenResult?.error_message || tokenResult?.error || tokenResponse.status
      )

      return NextResponse.json(
        { error: 'Não foi possível trocar o código do Instagram por um token.' },
        { status: 400 }
      )
    }

    const shortLivedToken = tokenResult?.access_token

    if (!shortLivedToken) {
      return NextResponse.json(
        { error: 'Instagram não retornou um access token.' },
        { status: 400 }
      )
    }

    const longTokenResponse = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(
        appSecret
      )}&access_token=${encodeURIComponent(shortLivedToken)}`,
      {
        cache: 'no-store',
      }
    )

    const longTokenResult = await longTokenResponse
      .json()
      .catch(() => null)

    if (!longTokenResponse.ok) {
      console.error(
        '[instagram/callback] long-lived token exchange failed:',
        longTokenResult?.error?.message || longTokenResponse.status
      )

      return NextResponse.json(
        {
          error:
            'Não foi possível obter o token de longa duração do Instagram.',
        },
        { status: 400 }
      )
    }

    const accessToken =
      longTokenResult?.access_token || shortLivedToken

    const profileResponse = await fetch(
      'https://graph.instagram.com/me?fields=id,username',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      }
    )

    const instagramProfile = await profileResponse.json().catch(() => null)

    if (!profileResponse.ok || !instagramProfile?.id) {
      console.error(
        '[instagram/callback] profile lookup failed:',
        instagramProfile?.error?.message || profileResponse.status
      )

      return NextResponse.json(
        {
          error:
            'Não foi possível identificar a conta do Instagram conectada.',
        },
        { status: 400 }
      )
    }

    const admin = supabaseAdmin()

    const { error: saveError } = await admin
      .from('instagram_config')
      .upsert(
        {
          user_id: user.id,
          instagram_user_id: String(instagramProfile.id),
          access_token: accessToken,
          status: 'connected',
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id',
        }
      )

    if (saveError) {
      console.error(
        '[instagram/callback] config save failed:',
        saveError
      )

      return NextResponse.json(
        { error: 'Não foi possível salvar a conexão do Instagram.' },
        { status: 500 }
      )
    }

    const response = NextResponse.redirect(
      new URL(
        '/dashboard/settings?instagram_connected=1',
        'https://wacrm.delivery73.com'
      )
    )

    response.cookies.delete('instagram_oauth_state')

    return response
  } catch (error) {
    console.error('[instagram/callback] failed:', error)

    return NextResponse.json(
      { error: 'Erro ao concluir a conexão com o Instagram.' },
      { status: 500 }
    )
  }
}
