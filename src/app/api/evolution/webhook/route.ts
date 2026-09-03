import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    console.log('[Evolution Webhook] Payload recebido:', JSON.stringify(body, null, 2))

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[Evolution Webhook] Erro:', error)

    return NextResponse.json(
      { received: false, error: 'Payload inválido' },
      { status: 400 }
    )
  }
}
