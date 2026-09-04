export interface EvolutionSendTextResult {
  messageId: string
}

export async function sendEvolutionTextMessage(args: {
  instanceName: string
  to: string
  text: string
}): Promise<EvolutionSendTextResult> {
  const evolutionUrl = process.env.EVOLUTION_API_URL
  const evolutionKey = process.env.EVOLUTION_API_KEY

  if (!evolutionUrl || !evolutionKey) {
    throw new Error('Evolution API não configurada no servidor.')
  }

  const response = await fetch(
    `${evolutionUrl.replace(/\/$/, '')}/message/sendText/${encodeURIComponent(args.instanceName)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: evolutionKey,
      },
      body: JSON.stringify({
        number: args.to,
        text: args.text,
      }),
      cache: 'no-store',
    }
  )

  const result = await response.json().catch(() => null)

  if (!response.ok) {
    const detail =
      result?.message ||
      result?.error ||
      result?.response?.message ||
      `HTTP ${response.status}`

    throw new Error(`Evolution API error: ${detail}`)
  }

  const messageId =
    result?.key?.id ||
    result?.message?.key?.id ||
    result?.messageId

  if (!messageId) {
    throw new Error('Evolution API não retornou o ID da mensagem.')
  }

  return {
    messageId,
  }
}
