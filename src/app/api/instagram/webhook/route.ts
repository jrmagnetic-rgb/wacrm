import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isUniqueViolation } from '@/lib/contacts/dedupe'
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
  sender?: {
    id?: string
  }
  recipient?: {
    id?: string
  }
  timestamp?: number
  message?: InstagramMessage
  read?: unknown
  delivery?: unknown
  postback?: unknown
  reaction?: unknown
  message_edit?: unknown
  referral?: unknown
}

interface InstagramWebhookEntry {
  id?: string
  time?: number
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

    console.log('[instagram/webhook] webhook received:', {
      object: body.object,
      entries: body.entry?.length || 0,
    })

    if (body.object !== 'instagram') {
      console.warn(
        '[instagram/webhook] invalid object:',
        body.object
      )

      return NextResponse.json(
        { received: false },
        { status: 200 }
      )
    }

    const admin = supabaseAdmin()

    for (const entry of body.entry || []) {
      const entryId = entry.id

      console.log('[instagram/webhook] entry:', {
        entryId: entryId || 'no-entry-id',
        events: entry.messaging?.length || 0,
      })

      for (const event of entry.messaging || []) {
        /*
         * Diagnóstico da estrutura real enviada pela Meta.
         * Não registra tokens, segredos ou credenciais.
         */
        console.log('[instagram/webhook] RAW EVENT:', JSON.stringify(event))

        console.log('[instagram/webhook] event structure:', {
          entryId: entryId || null,
          keys: Object.keys(event),
          senderId: event.sender?.id || null,
          recipientId: event.recipient?.id || null,
          message: event.message || null,
          read: event.read || null,
          delivery: event.delivery || null,
          postback: event.postback || null,
          reaction: event.reaction || null,
          messageEdit: event.message_edit || null,
          referral: event.referral || null,
        })

        const senderId = event.sender?.id
        const recipientId = event.recipient?.id
        const message = event.message

        /*
         * Eventos como read, delivery, reaction etc.
         * não são mensagens recebidas.
         *
         * Eles são reconhecidos e ignorados normalmente.
         */
        if (!senderId || !recipientId || !message) {
          console.log(
            '[instagram/webhook] non-message event ignored:',
            {
              entryId: entryId || null,
              eventKeys: Object.keys(event),
            }
          )

          continue
        }

        /*
         * Neste momento processamos mensagens de texto.
         */
        if (!message.text) {
          console.log(
            '[instagram/webhook] non-text message ignored:',
            {
              messageId: message.mid || 'no-mid',
              senderId,
              recipientId,
            }
          )

          continue
        }

        const contentText = message.text.trim()

        if (!contentText) {
          console.warn(
            '[instagram/webhook] empty text ignored'
          )

          continue
        }

        /*
         * A conta que recebeu a mensagem pode ser identificada
         * por recipient.id ou pelo entry.id.
         *
         * Tentamos os dois identificadores.
         */
        let config = null

        const {
          data: configByRecipient,
          error: recipientConfigError,
        } = await admin
          .from('instagram_config')
          .select(
            'user_id, instagram_user_id, status'
          )
          .eq(
            'instagram_user_id',
            recipientId
          )
          .maybeSingle()

        if (recipientConfigError) {
          console.error(
            '[instagram/webhook] recipient config lookup failed:',
            recipientConfigError
          )
        } else if (configByRecipient) {
          config = configByRecipient
        }

        if (!config && entryId && entryId !== recipientId) {
          const {
            data: configByEntry,
            error: entryConfigError,
          } = await admin
            .from('instagram_config')
            .select(
              'user_id, instagram_user_id, status'
            )
            .eq(
              'instagram_user_id',
              entryId
            )
            .maybeSingle()

          if (entryConfigError) {
            console.error(
              '[instagram/webhook] entry config lookup failed:',
              entryConfigError
            )
          } else if (configByEntry) {
            config = configByEntry
          }
        }

        console.log(
          '[instagram/webhook] config resolution:',
          {
            recipientId,
            entryId: entryId || null,
            configuredInstagramUserId:
              config?.instagram_user_id || null,
            found: Boolean(config),
            status: config?.status || null,
          }
        )

        if (
          !config ||
          config.status !== 'connected'
        ) {
          console.warn(
            '[instagram/webhook] no connected config for incoming account:',
            {
              recipientId,
              entryId: entryId || null,
            }
          )

          continue
        }

        /*
         * Descobre a conta do WACRM responsável pelo Instagram.
         */
        const {
          data: profile,
          error: profileError,
        } = await admin
          .from('profiles')
          .select('account_id')
          .eq(
            'user_id',
            config.user_id
          )
          .maybeSingle()

        if (
          profileError ||
          !profile?.account_id
        ) {
          console.error(
            '[instagram/webhook] account lookup failed:',
            profileError
          )

          continue
        }

        const accountId = profile.account_id

        /*
         * Localiza o contato pelo ID do usuário
         * que enviou a mensagem no Instagram.
         */
        const {
          data: instagramContact,
          error: contactLookupError,
        } = await admin
          .from('contacts')
          .select('*')
          .eq(
            'account_id',
            accountId
          )
          .eq(
            'instagram_user_id',
            senderId
          )
          .maybeSingle()

        if (contactLookupError) {
          console.error(
            '[instagram/webhook] contact lookup failed:',
            contactLookupError
          )

          continue
        }

        let contact = instagramContact

        /*
         * Cria o contato caso seja a primeira mensagem.
         */
        if (!contact) {
          const {
            data: newContact,
            error: contactError,
          } = await admin
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

          if (
            !contactError &&
            newContact
          ) {
            contact = newContact
          } else if (
            contactError &&
            isUniqueViolation(contactError)
          ) {
            /*
             * Outra requisição pode ter criado o contato
             * simultaneamente.
             */
            const {
              data: racedContact,
              error: racedContactError,
            } = await admin
              .from('contacts')
              .select('*')
              .eq(
                'account_id',
                accountId
              )
              .eq(
                'instagram_user_id',
                senderId
              )
              .maybeSingle()

            if (racedContactError) {
              console.error(
                '[instagram/webhook] raced contact lookup failed:',
                racedContactError
              )

              continue
            }

            contact = racedContact
          } else {
            console.error(
              '[instagram/webhook] contact creation failed:',
              contactError
            )

            continue
          }
        }

        if (!contact) {
          console.error(
            '[instagram/webhook] contact unavailable after creation'
          )

          continue
        }

        /*
         * Procura uma conversa existente do Instagram.
         */
        const {
          data: existingConversation,
          error: conversationLookupError,
        } = await admin
          .from('conversations')
          .select('*')
          .eq(
            'account_id',
            accountId
          )
          .eq(
            'contact_id',
            contact.id
          )
          .eq(
            'channel',
            'instagram'
          )
          .maybeSingle()

        if (conversationLookupError) {
          console.error(
            '[instagram/webhook] conversation lookup failed:',
            conversationLookupError
          )

          continue
        }

        let conversationId =
          existingConversation?.id

        /*
         * Cria a conversa se ainda não existir.
         */
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

          if (
            !conversationError &&
            newConversation
          ) {
            conversationId =
              newConversation.id
          } else if (
            conversationError &&
            isUniqueViolation(
              conversationError
            )
          ) {
            /*
             * Outra requisição pode ter criado
             * a conversa simultaneamente.
             */
            const {
              data: racedConversation,
              error: racedError,
            } = await admin
              .from('conversations')
              .select('*')
              .eq(
                'account_id',
                accountId
              )
              .eq(
                'contact_id',
                contact.id
              )
              .eq(
                'channel',
                'instagram'
              )
              .maybeSingle()

            if (racedError) {
              console.error(
                '[instagram/webhook] raced conversation lookup failed:',
                racedError
              )

              continue
            }

            conversationId =
              racedConversation?.id
          } else {
            console.error(
              '[instagram/webhook] conversation creation failed:',
              conversationError
            )

            continue
          }
        }

        if (!conversationId) {
          console.error(
            '[instagram/webhook] conversation unavailable'
          )

          continue
        }

        /*
         * Salva a mensagem recebida.
         */
        const {
          error: messageError,
        } = await admin
          .from('messages')
          .upsert(
            {
              conversation_id:
                conversationId,
              sender_type:
                'customer',
              content_type:
                'text',
              content:
                contentText,
              message_id:
                message.mid || null,
              status:
                'delivered',
            },
            {
              onConflict:
                'message_id',
              ignoreDuplicates:
                true,
            }
          )

        if (messageError) {
          console.error(
            '[instagram/webhook] message insert failed:',
            messageError
          )

          continue
        }

        /*
         * Abre/reabre a conversa.
         */
        await admin
          .from('conversations')
          .update({
            status: 'open',
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            'id',
            conversationId
          )

        await reopenClosedConversation(
          admin,
          conversationId
        )

        console.log(
          '[instagram/webhook] message processed successfully:',
          {
            messageId:
              message.mid ||
              'no-mid',
            senderId,
            recipientId,
            entryId:
              entryId ||
              null,
            conversationId,
          }
        )
      }
    }

    return NextResponse.json(
      {
        received: true,
      },
      {
        status: 200,
      }
    )
  } catch (error) {
    console.error(
      '[instagram/webhook] failed:',
      error
    )

    return NextResponse.json(
      {
        error:
          'Erro ao processar webhook do Instagram.',
      },
      {
        status: 500,
      }
    )
  }
}
