import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { findExistingContact, isUniqueViolation } from '@/lib/contacts/dedupe'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'
import { reopenClosedConversation } from '@/lib/conversations/reopen'

let _adminClient: any = null

function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }

  return _adminClient
}

interface InstagramMessage {
  mid?: string
  text?: string
}

interface InstagramMessagingEvent {
  sender?: { id?: string }
  recipient?: { id?: string }
  timestamp?: number
  message?: InstagramMessage
}

interface InstagramWebhookEntry {
  id?: string
  messaging?: InstagramMessagingEvent[]
}

interface InstagramWebhookPayload {
  object?: string
  entry?: InstagramWebhookEntry[]
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const verifyToken = process.env.INSTAGRAM_VERIFY_TOKEN

  if (
    mode === 'subscribe' &&
    verifyToken &&
    token === verifyToken &&
    challenge
  ) {
    return new Response(challenge, { status: 200 })
  }

  return new Response('Forbidden', { status: 403 })
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as InstagramWebhookPayload

    if (body.object !== 'instagram') {
      return NextResponse.json({ received: false }, { status: 200 })
    }

    const admin = supabaseAdmin()

    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        const senderId = event.sender?.id
        const recipientId = event.recipient?.id
        const message = event.message

        if (!senderId || !recipientId || !message?.text) {
          continue
        }

        const contentText = message.text.trim()

        if (!contentText) {
          continue
        }

        const { data: config, error: configError } = await admin
          .from('instagram_config')
          .select('user_id, instagram_user_id, status')
          .eq('instagram_user_id', recipientId)
          .maybeSingle()

        if (configError) {
          console.error(
            '[instagram/webhook] config lookup failed:',
            configError
          )
          continue
        }

        if (!config || config.status !== 'connected') {
          console.warn(
            '[instagram/webhook] no connected config for recipient'
          )
          continue
        }

        const { data: profile, error: profileError } = await admin
          .from('profiles')
          .select('account_id')
          .eq('user_id', config.user_id)
          .maybeSingle()

        if (profileError || !profile?.account_id) {
          console.error(
            '[instagram/webhook] account lookup failed:',
            profileError
          )
          continue
        }

        const accountId = profile.account_id

       const { data: instagramContact } = await admin
  .from('contacts')
  .select('*')
  .eq('account_id', accountId)
  .eq('instagram_user_id', senderId)
  .maybeSingle()

let contact = instagramContact

        if (!contact) {
                   const { data: newContact, error: contactError } = await admin
            .from('contacts')
            .insert({
              account_id: accountId,
              user_id: config.user_id,
              phone: `instagram-${senderId}`,
              instagram_user_id: senderId,
              name: `Instagram ${senderId}`,
            })
            .select('*')
            .single()

          if (contactError) {
            if (isUniqueViolation(contactError)) {
                        }

            if (!contact) {
              console.error(
                '[instagram/webhook] contact creation failed:',
                contactError
              )
              continue
            }
          } else {
            contact = newContact
          }
        }
        if (!contact) {
          console.error(
            '[instagram/webhook] contact unavailable after creation'
          )
          continue
        }
        const {
          data: existingConversation,
          error: conversationLookupError,
        } = await admin
          .from('conversations')
          .select('*')
          .eq('account_id', accountId)
          .eq('contact_id', contact.id)
          .eq('channel', 'instagram')
          .maybeSingle()

        if (conversationLookupError) {
          console.error(
            '[instagram/webhook] conversation lookup failed:',
            conversationLookupError
          )
          continue
        }

        let conversationId = existingConversation?.id

        if (!conversationId) {
          const {
            data: newConversation,
            error: conversationError,
          } = await admin
            .from('conversations')
            .insert({
              account_id: accountId,
              user_id: config.user_id,
              contact_id: contact.id,
              channel: 'instagram',
            })
            .select('*')
            .single()

          if (conversationError) {
            if (isUniqueViolation(conversationError)) {
              const { data: racedConversation } = await admin
                .from('conversations')
                .select('*')
                .eq('account_id', accountId)
                .eq('contact_id', contact.id)
                .eq('channel', 'instagram')
                .maybeSingle()

              conversationId = racedConversation?.id
            }

            if (!conversationId) {
              console.error(
                '[instagram/webhook] conversation creation failed:',
                conversationError
              )
              continue
            }
          } else {
            conversationId = newConversation.id
          }
        }

        const { error: messageError } = await admin
          .from('messages')
          .upsert(
            {
              conversation_id: conversationId,
              sender_type: 'customer',
              content_type: 'text',
              content: contentText,
              message_id: message.mid || null,
              status: 'delivered',
            },
            {
              onConflict: 'message_id',
              ignoreDuplicates: true,
            }
          )

        if (messageError) {
          console.error(
            '[instagram/webhook] message insert failed:',
            messageError
          )
          continue
        }

        await admin
          .from('conversations')
          .update({
            status: 'open',
            updated_at: new Date().toISOString(),
          })
          .eq('id', conversationId)

        await reopenClosedConversation(admin, conversationId)

        console.log(
          '[instagram/webhook] message received:',
          message.mid || 'no-mid'
        )
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[instagram/webhook] failed:', error)

    return NextResponse.json(
      { error: 'Erro ao processar webhook do Instagram.' },
      { status: 500 }
    )
  }
}