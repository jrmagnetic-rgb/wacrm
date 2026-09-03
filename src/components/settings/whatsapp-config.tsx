'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Loader2,
  QrCode,
  RefreshCw,
  Smartphone,
  XCircle,
} from 'lucide-react';

import { useTranslations } from 'next-intl';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SettingsPanelHead } from './settings-panel-head';

type EvolutionStatus = {
  connected: boolean;
  status: string;
  instanceName: string;
};

export function WhatsAppConfig() {
  const t = useTranslations('Settings.whatsapp');
  const { accountId, loading: authLoading, profileLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState<EvolutionStatus | null>(null);

  const checkStatus = useCallback(async () => {
    if (!accountId) return;

    try {
      setChecking(true);

      const response = await fetch('/api/evolution/status', {
        method: 'GET',
        cache: 'no-store',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível consultar o WhatsApp.');
      }

      setStatus(data);

      if (data.connected) {
        setQrCode(null);
      }
    } catch (error) {
      console.error('[WhatsApp Evolution] Status:', error);
      setStatus(null);
    } finally {
      setChecking(false);
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    if (!authLoading && !profileLoading && accountId) {
      checkStatus();
    }
  }, [authLoading, profileLoading, accountId, checkStatus]);

  useEffect(() => {
    if (!qrCode || status?.connected) return;

    const interval = setInterval(async () => {
      await checkStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, [qrCode, status?.connected, checkStatus]);

  async function handleConnect() {
    try {
      setConnecting(true);
      setQrCode(null);

      const response = await fetch('/api/evolution/connect', {
        method: 'POST',
        cache: 'no-store',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || 'Não foi possível iniciar a conexão.'
        );
      }

      if (data.qrcode) {
        setQrCode(data.qrcode);
        setStatus({
          connected: false,
          status: data.status || 'connecting',
          instanceName: data.instanceName,
        });

        toast.success('QR Code gerado. Escaneie com o WhatsApp.');
      } else {
        await checkStatus();

        if (data.status === 'open') {
          toast.success('WhatsApp conectado!');
        } else {
          toast.success('Conexão iniciada. Aguarde alguns segundos.');
        }
      }
    } catch (error) {
      console.error('[WhatsApp Evolution] Connect:', error);

      toast.error(
        error instanceof Error
          ? error.message
          : 'Erro ao conectar o WhatsApp.'
      );
    } finally {
      setConnecting(false);
    }
  }

  if (loading) {
    return (
      <section className="animate-in fade-in-50 duration-200">
        <SettingsPanelHead
          title={t('title')}
          description={t('description')}
        />

        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  const connected = status?.connected === true;

  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="WhatsApp"
        description="Conecte seu WhatsApp usando a Evolution API."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Alert className="bg-card border-border">
            <div className="flex items-center gap-2">
              {connected ? (
                <CheckCircle2 className="size-4 text-primary" />
              ) : (
                <XCircle className="size-4 text-red-500" />
              )}

              <AlertTitle className="mb-0 text-foreground">
                {connected
                  ? 'WhatsApp conectado'
                  : 'WhatsApp não conectado'}
              </AlertTitle>
            </div>

            <AlertDescription className="text-muted-foreground">
              {connected
                ? 'Seu WhatsApp está conectado e pronto para receber e enviar mensagens.'
                : 'Conecte seu WhatsApp escaneando o QR Code pelo aplicativo.'}
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="size-5" />
                Conexão WhatsApp
              </CardTitle>

              <CardDescription>
                A conexão é feita diretamente pela Evolution API.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {connected ? (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-6 text-center">
                  <CheckCircle2 className="mx-auto mb-3 size-12 text-primary" />

                  <h3 className="text-lg font-semibold">
                    WhatsApp conectado
                  </h3>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Sua conexão está ativa.
                  </p>

                  <Button
                    variant="outline"
                    className="mt-5"
                    onClick={checkStatus}
                    disabled={checking}
                  >
                    {checking ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}

                    Atualizar status
                  </Button>
                </div>
              ) : (
                <>
                  {qrCode ? (
                    <div className="flex flex-col items-center rounded-lg border bg-background p-6">
                      <QrCode className="mb-3 size-6 text-primary" />

                      <h3 className="text-lg font-semibold">
                        Escaneie o QR Code
                      </h3>

                      <p className="mb-5 text-center text-sm text-muted-foreground">
                        Abra o WhatsApp no celular, acesse
                        <br />
                        <strong>Aparelhos conectados</strong> e escaneie este
                        código.
                      </p>

                      <div className="rounded-xl border bg-white p-3">
                        <img
                          src={qrCode}
                          alt="QR Code para conectar o WhatsApp"
                          className="size-64"
                        />
                      </div>

                      <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        Aguardando conexão...
                      </div>

                      <Button
                        variant="outline"
                        className="mt-4"
                        onClick={handleConnect}
                        disabled={connecting}
                      >
                        <RefreshCw className="size-4" />
                        Gerar novo QR Code
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-8 text-center">
                      <QrCode className="mx-auto mb-4 size-12 text-muted-foreground" />

                      <h3 className="text-lg font-semibold">
                        Conecte seu WhatsApp
                      </h3>

                      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                        Clique no botão abaixo para gerar um QR Code e
                        conectar seu WhatsApp.
                      </p>

                      <Button
                        className="mt-6"
                        onClick={handleConnect}
                        disabled={connecting}
                      >
                        {connecting ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <QrCode className="size-4" />
                        )}

                        {connecting
                          ? 'Gerando QR Code...'
                          : 'Conectar WhatsApp'}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Como conectar</CardTitle>

            <CardDescription>
              Siga estes passos para conectar seu WhatsApp.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <ol className="space-y-4 text-sm">
              <li className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                  1
                </span>

                <span>
                  Clique em <strong>Conectar WhatsApp</strong>.
                </span>
              </li>

              <li className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                  2
                </span>

                <span>
                  Abra o WhatsApp no seu celular.
                </span>
              </li>

              <li className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                  3
                </span>

                <span>
                  Acesse <strong>Aparelhos conectados</strong>.
                </span>
              </li>

              <li className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                  4
                </span>

                <span>
                  Escaneie o QR Code exibido nesta tela.
                </span>
              </li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}