import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
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
      `${evolutionUrl.replace(/\/$/, '')}/instance/fetchInstances`,
      {
        method: 'GET',
        headers: {
          apikey: evolutionKey,
        },
        cache: 'no-store',
      }
    );

    const instances = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: 'Não foi possível consultar a Evolution API.',
          details: instances,
        },
        { status: response.status }
      );
    }

    const instance = Array.isArray(instances)
      ? instances.find((item: any) => item?.name === instanceName)
      : null;

    const connectionStatus = instance?.connectionStatus || 'not_found';

    return NextResponse.json({
      connected: connectionStatus === 'open',
      status: connectionStatus,
      instanceName,
    });
  } catch (error) {
    console.error('[Evolution Status]', error);

    return NextResponse.json(
      { error: 'Erro interno ao consultar a Evolution API.' },
      { status: 500 }
    );
  }
}
