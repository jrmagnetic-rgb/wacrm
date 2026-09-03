import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError || !profile?.account_id) {
      return NextResponse.json(
        { error: 'Sua conta não está vinculada a uma organização.' },
        { status: 403 }
      );
    }

    const evolutionUrl = process.env.EVOLUTION_API_URL;
    const evolutionKey = process.env.EVOLUTION_API_KEY;

    if (!evolutionUrl || !evolutionKey) {
      return NextResponse.json(
        { error: 'Evolution API não configurada no servidor.' },
        { status: 500 }
      );
    }

    const instanceName = `wacrm-${profile.account_id}`;

    const response = await fetch(
      `${evolutionUrl.replace(/\/$/, '')}/instance/create`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: evolutionKey,
        },
        body: JSON.stringify({
          instanceName,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        }),
        cache: 'no-store',
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: data?.message || 'Não foi possível criar a conexão WhatsApp.',
          details: data,
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      instanceName,
      status: data?.instance?.status || 'connecting',
      qrcode: data?.qrcode?.base64 || null,
      pairingCode: data?.qrcode?.pairingCode || null,
    });
  } catch (error) {
    console.error('[Evolution Connect]', error);

    return NextResponse.json(
      { error: 'Erro interno ao conectar com a Evolution API.' },
      { status: 500 }
    );
  }
}