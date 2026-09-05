import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    instagram_app_id: process.env.INSTAGRAM_APP_ID || null,
    instagram_redirect_uri: process.env.INSTAGRAM_REDIRECT_URI || null,
    has_app_secret: Boolean(process.env.INSTAGRAM_APP_SECRET),
    has_verify_token: Boolean(process.env.INSTAGRAM_VERIFY_TOKEN),
  })
}
