import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(
        new URL('/login', process.env.NEXT_PUBLIC_SITE_URL || 'https://wacrm.delivery73.com')
      )
    }

    const appId = process.env.INSTAGRAM_APP_ID
    const redirectUri = process.env.INSTAGRAM_REDIRECT_URI

    if (!appId || !redirectUri) {
      return NextResponse.json(
        { error: 'Instagram OAuth não configurado no servidor.' },
        { status: 500 }
      )
    }

    const state = crypto.randomUUID()

    const response = new NextResponse(null, {
      status: 307,
      headers: {
        Location: `https://www.instagram.com/oauth/authorize?client_id=${encodeURIComponent(
          appId
        )}&redirect_uri=${encodeURIComponent(
          redirectUri
        )}&response_type=code&scope=${encodeURIComponent(
          'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments'
        )}`,
      },
    })

    response.cookies.set('instagram_oauth_state', state, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    })

    const location = response.headers.get('Location')!

    const separator = location.includes('?') ? '&' : '?'

    response.headers.set(
      'Location',
      `${location}${separator}state=${encodeURIComponent(state)}`
    )

    return response
  } catch (error) {
    console.error('[instagram/connect] failed:', error)

    return NextResponse.json(
      { error: 'Não foi possível iniciar a conexão com o Instagram.' },
      { status: 500 }
    )
  }
}
