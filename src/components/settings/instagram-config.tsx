'use client'

import { useState } from 'react'
import { CheckCircle2, Camera, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export function InstagramConfig() {
  const [connecting, setConnecting] = useState(false)

  function handleConnect() {
    setConnecting(true)
    window.location.href = '/api/instagram/connect'
  }

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
        <Alert className="bg-card border-border">
          <div className="flex items-center gap-2">
            <XCircle className="size-4 text-red-500" />

            <AlertTitle className="mb-0 text-foreground">
              Instagram não conectado
            </AlertTitle>
          </div>

          <AlertDescription className="text-muted-foreground">
            Conecte sua conta do Instagram para receber e responder mensagens
            diretamente pelo WACRM.
          </AlertDescription>
        </Alert>

        <div className="rounded-lg border border-dashed p-8 text-center">
          <Camera className="mx-auto mb-4 size-12 text-muted-foreground" />

          <h3 className="text-lg font-semibold">
            Conecte seu Instagram
          </h3>

          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Clique abaixo para autorizar o WACRM a acessar as mensagens da sua
            conta profissional do Instagram.
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

