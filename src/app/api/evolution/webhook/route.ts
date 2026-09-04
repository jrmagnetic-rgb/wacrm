import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'
import { findExistingContact, isUniqueViolation } from '@/lib/contacts/dedupe'
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

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const event = body?.event
    const instanceName = body?.instance
    const data = body?.data

    console.log('[Evolution Webhook] EVENTO:', event)
    console.log('[Evolution Webhook] INSTANCE:', instanceName)

    if (event !== 'messages.upsert') {
      return NextResponse.json({ received: true })
    }

    if (!instanceName || !data?.key) {
      return NextResponse.json({ received: true })
    }

    if (data.key.fromMe === true) {
      return NextResponse.json({ received: true })
    }

    const match = /^wacrm-([0-9a-f-]+)$/i.exec(instanceName)

    if (!match) {
      console.warn('[Evolution Webhook] Instância inválida:', instanceName)
      return NextResponse.json({ received: true })
    }

    const accountId = match[1]
    const remoteJid = data.key.remoteJid

    if (!remoteJid || remoteJid.endsWith('@g.us')) {
      return NextResponse.json({ received: true })
    }

    const phone = normalizePhone(
      remoteJid.replace(/@s\.whatsapp\.net$/, '')
    )

    if (!phone) {
      return NextResponse.json({ received: true })
    }

    const messageId = data.key.id

    if (!messageId) {
      return NextResponse.json({ received: true })
    }

    const contentText =
      data.message?.conversation ??
      data.message?.extendedTextMessage?.text ??
      ''

    const contactName = data.pushName || phone

    const { data: profile, error: profileError } = await supabaseAdmin()
      .from('profiles')
      .select('user_id')
      .eq('account_id', accountId)
      .limit(1)
      .maybeSingle()

    if (profileError || !profile?.user_id) {
      console.error('[Evolution Webhook] Perfil não encontrado:', profileError)
      return NextResponse.json({ received: true })
    }

    const configOwnerUserId = profile.user_id

    let contact = await findExistingContact(
      supabaseAdmin(),
      accountId,
      phone
    )

    if (contact) {
      if (contactName && contactName !== contact.name) {
        await supabaseAdmin()
          .from('contacts')
          .update({
            name: contactName,
            updated_at: new Date().toISOString(),
          })
          .eq('id', contact.id)
      }
    } else {
      const { data: newContact, error: createContactError } =
        await supabaseAdmin()
          .from('contacts')
          .insert({
            account_id: accountId,
            user_id: configOwnerUserId,
            phone,
            name: contactName,
          })
          .select()
          .single()

      if (createContactError) {
        if (isUniqueViolation(createContactError)) {
          contact = await findExistingContact(
            supabaseAdmin(),
            accountId,
            phone
          )
        }

        if (!contact) {
          console.error(
            '[Evolution Webhook] Erro ao criar contato:',
            createContactError
          )
          return NextResponse.json({ received: true })
        }
      } else {
        contact = newContact
      }
    }

    if (!contact) {
      return NextResponse.json({ received: true })
    }

    const { data: existingConversations, error: conversationFindError } =
      await supabaseAdmin()
        .from('conversations')
        .select('*')
        .eq('account_id', accountId)
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: true })
        .limit(1)

    if (conversationFindError) {
      console.error(
        '[Evolution Webhook] Erro ao buscar conversa:',
        conversationFindError
      )
      return NextResponse.json({ received: true })
    }

    let conversation =
      existingConversations && existingConversations.length > 0
        ? existingConversations[0]
        : null

    if (!conversation) {
      const { data: newConversation, error: createConversationError } =
        await supabaseAdmin()
          .from('conversations')
          .insert({
            account_id: accountId,
            user_id: configOwnerUserId,
            contact_id: contact.id,
          })
          .select()
          .single()

      if (createConversationError) {
        if (isUniqueViolation(createConversationError)) {
          const { data: racedConversation } = await supabaseAdmin()
            .from('conversations')
            .select('*')
            .eq('account_id', accountId)
            .eq('contact_id', contact.id)
            .order('created_at', { ascending: true })
            .limit(1)

          conversation = racedConversation?.[0] ?? null
        }

        if (!conversation) {
          console.error(
            '[Evolution Webhook] Erro ao criar conversa:',
            createConversationError
          )
          return NextResponse.json({ received: true })
        }
      } else {
        conversation = newConversation
      }
    }

    const messageType = 'text'

    const timestamp = data.messageTimestamp
      ? new Date(Number(data.messageTimestamp) * 1000).toISOString()
      : new Date().toISOString()

    const { data: insertedRows, error: messageError } =
      await supabaseAdmin()
        .from('messages')
        .upsert(
          {
            conversation_id: conversation.id,
            sender_type: 'customer',
            content_type: messageType,
            content_text: contentText || `[${data.messageType || 'message'}]`,
            media_url: null,
            media_type: null,
            message_id: messageId,
            status: 'delivered',
            created_at: timestamp,
          },
          {
            onConflict: 'conversation_id,message_id',
            ignoreDuplicates: true,
          }
        )
        .select('id')

    if (messageError) {
      console.error(
        '[Evolution Webhook] Erro ao salvar mensagem:',
        messageError
      )
      return NextResponse.json({ received: true })
    }

    if (!insertedRows || insertedRows.length === 0) {
      return NextResponse.json({ received: true })
    }

    const { error: bumpError } = await supabaseAdmin().rpc(
      'bump_conversation_on_inbound',
      {
        p_conversation_id: conversation.id,
        p_last_message_text:
          contentText || `[${data.messageType || 'message'}]`,
      }
    )

    if (bumpError) {
      console.error(
        '[Evolution Webhook] Erro ao atualizar conversa:',
        bumpError
      )
    }

    await reopenClosedConversation(
      supabaseAdmin(),
      conversation
    )

    console.log('[Evolution Webhook] Mensagem salva:', {
      messageId,
      conversationId: conversation.id,
      phone,
    })

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[Evolution Webhook] Erro:', error)

    return NextResponse.json(
      { received: false, error: 'Payload inválido' },
      { status: 400 }
    )
  }
}

