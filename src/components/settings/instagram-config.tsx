'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Camera, Loader2, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface InstagramConfigData {
  instagram_user_id: string
  status: 'connected' | 'disconnected'
}

export function InstagramConfig() {
  const [connecting, setConnecting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<InstagramConfigData | null>(null)

  useEffect(() => {
    let mounted = true

    async function loadConfig() {
      try {
        const supabase = createClient()

        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          if (mounted) {
            setConfig(null)
            setLoading(false)
          }
          return
        }

        const { data, error } = await supabase
          .from('instagram_config')
          .select('instagram_user_id, status')
          .eq('user_id', user.id)
          .maybeSingle()

        if (error) {
          console.error(
            '[instagram-config] config lookup failed:',
            error
          )

          if (mounted) {
            setConfig(null)
            setLoading(false)
          }

          return
        }

        if (mounted) {
          setConfig(data)
          setLoading(false)
        }
      } catch (error) {
        console.error(
          '[instagram-config] failed to load config:',
          error
        )

        if (mounted) {
          setConfig(null)
          setLoading(false)
        }
      }
    }

    loadConfig()

    return () => {
      mounted = false
    }
  }, [])

  function handleConnect() {
    setConnecting(true)
    window.location.href = '/api/instagram/connect'
  }

  const connected = config?.status === 'connected'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="size-5" />
          Instagram
        </CardTitle>

        <CardDescription>
          Conecte sua conta profissional do Instagram ao WACRM.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {loading ? (
          <Alert className="bg-card border-border">
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-primary" />

              <AlertTitle className="mb-0 text-foreground">
                Verificando conexão...
              </AlertTitle>
            </div>

            <AlertDescription className="text-muted-foreground">
              Verificando o status da sua conta do Instagram.
            </AlertDescription>
          </Alert>
        ) : connected ? (
          <Alert className="bg-card border-border">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-green-500" />

              <AlertTitle className="mb-0 text-foreground">
                Instagram conectado
              </AlertTitle>
            </div>

            <AlertDescription className="text-muted-foreground">
              Sua conta profissional do Instagram está conectada ao WACRM.
              {config?.instagram_user_id && (
                <span className="block mt-1 text-xs">
                  ID da conta: {config.instagram_user_id}
                </span>
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="bg-card border-border">
            <div className="flex items-center gap-2">
              <XCircle className="size-4 text-red-500" />

              <AlertTitle className="mb-0 text-foreground">
                Instagram não conectado
              </AlertTitle>
            </div>

            <AlertDescription className="text-muted-foreground">
              Conecte sua conta do Instagram para receber e responder
              mensagens diretamente pelo WACRM.
            </AlertDescription>
          </Alert>
        )}

        <div className="rounded-lg border border-dashed p-8 text-center">
          {connected ? (
            <CheckCircle2 className="mx-auto mb-4 size-12 text-green-500" />
          ) : (
            <Camera className="mx-auto mb-4 size-12 text-muted-foreground" />
          )}

          <h3 className="text-lg font-semibold">
            {connected
              ? 'Instagram conectado'
              : 'Conecte seu Instagram'}
          </h3>

          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {connected
              ? 'Sua conta está autorizada e pronta para receber mensagens pelo WACRM.'
              : 'Clique abaixo para autorizar o WACRM a acessar as mensagens da sua conta profissional do Instagram.'}
          </p>

          <Button
            className="mt-6"
            onClick={handleConnect}
            disabled={connecting}
          >
            {connecting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Camera className="size-4" />
            )}

            {connecting
              ? 'Conectando Instagram...'
              : connected
                ? 'Reconectar Instagram'
                : 'Conectar Instagram'}
          </Button>
        </div>

        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />

            <p>
              A conexão será autorizada pelo próprio Instagram. O WACRM não
              terá acesso à sua senha.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}