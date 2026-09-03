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

    const baseUrl = evolutionUrl.replace(/\/$/, '');
    const instanceName = `wacrm-${profile.account_id}`;

    const headers = {
      apikey: evolutionKey,
    };

    // 1. Procurar uma instância que já existe
    const instancesResponse = await fetch(
      `${baseUrl}/instance/fetchInstances`,
      {
        method: 'GET',
        headers,
        cache: 'no-store',
      }
    );

    const instances = await instancesResponse.json();

    if (!instancesResponse.ok) {
      return NextResponse.json(
        {
          error: 'Não foi possível consultar as instâncias da Evolution API.',
          details: instances,
        },
        { status: instancesResponse.status }
      );
    }

    const existingInstance = Array.isArray(instances)
      ? instances.find((item: any) => item?.name === instanceName)
      : null;

    // 2. Se já existe e está conectada, não criar outra
    if (existingInstance?.connectionStatus === 'open') {
      return NextResponse.json({
        success: true,
        instanceName,
        status: 'open',
        qrcode: null,
      });
    }

    // 3. Se já existe, pedir um novo QR Code para essa instância
    if (existingInstance) {
      const connectResponse = await fetch(
        `${baseUrl}/instance/connect/${encodeURIComponent(instanceName)}`,
        {
          method: 'GET',
          headers,
          cache: 'no-store',
        }
      );

      const connectData = await connectResponse.json();

      if (!connectResponse.ok) {
        return NextResponse.json(
          {
            error:
              connectData?.message ||
              'Não foi possível reconectar a instância existente.',
            details: connectData,
          },
          { status: connectResponse.status }
        );
      }

      return NextResponse.json({
        success: true,
        instanceName,
        status: existingInstance.connectionStatus || 'connecting',
        qrcode: connectData?.base64 || connectData?.qrcode?.base64 || null,
        pairingCode:
          connectData?.pairingCode ||
          connectData?.qrcode?.pairingCode ||
          null,
      });
    }

    // 4. Se não existe, criar uma nova instância
    const createResponse = await fetch(
      `${baseUrl}/instance/create`,
      {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instanceName,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        }),
        cache: 'no-store',
      }
    );

    const createData = await createResponse.json();

    if (!createResponse.ok) {
      return NextResponse.json(
        {
          error:
            createData?.message ||
            'Não foi possível criar a conexão WhatsApp.',
          details: createData,
        },
        { status: createResponse.status }
      );
    }

    return NextResponse.json({
      success: true,
      instanceName,
      status: createData?.instance?.status || 'connecting',
      qrcode: createData?.qrcode?.base64 || null,
      pairingCode: createData?.qrcode?.pairingCode || null,
    });
  } catch (error) {
    console.error('[Evolution Connect]', error);

    return NextResponse.json(
      { error: 'Erro interno ao conectar o WhatsApp pela Evolution API.' },
      { status: 500 }
    );
  }
}
