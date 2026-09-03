import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    console.log('[Evolution Webhook] EVENTO:', body.event)
    console.log('[Evolution Webhook] INSTANCE:', body.instance)
    console.log('[Evolution Webhook] DATA:', JSON.stringify(body.data, null, 2))

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[Evolution Webhook] Erro:', error)

    return NextResponse.json(
      { received: false, error: 'Payload inválido' },
      { status: 400 }
    )
  }
}
