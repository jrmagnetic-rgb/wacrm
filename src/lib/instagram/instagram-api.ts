export interface InstagramSendTextResult {
  messageId: string
}

export async function sendInstagramTextMessage(args: {
  accessToken: string
  instagramUserId: string
  recipientId: string
  text: string
}): Promise<InstagramSendTextResult> {
  const response = await fetch(
    `https://graph.instagram.com/v23.0/${encodeURIComponent(args.instagramUserId)}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: {
          id: args.recipientId,
        },
        message: {
          text: args.text,
        },
      }),
      cache: 'no-store',
    }
  )

  const result = await response.json().catch(() => null)

  if (!response.ok) {
    const detail =
      result?.error?.message ||
      result?.message ||
      `HTTP ${response.status}`

    throw new Error(`Instagram API error: ${detail}`)
  }

  const messageId =
    result?.message_id ||
    result?.message?.id

  if (!messageId) {
    throw new Error('Instagram API não retornou o ID da mensagem.')
  }

  return { messageId }
}
