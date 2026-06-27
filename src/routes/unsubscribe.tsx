import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { SiteHeader } from '@/components/SiteHeader'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'

export const Route = createFileRoute('/unsubscribe')({
  head: () => ({
    meta: [
      { title: 'Cancelar suscripción — ContaClick' },
      { name: 'robots', content: 'noindex,nofollow' },
    ],
  }),
  component: UnsubscribePage,
})

type State =
  | { kind: 'loading' }
  | { kind: 'valid' }
  | { kind: 'already' }
  | { kind: 'invalid' }
  | { kind: 'submitting' }
  | { kind: 'done' }
  | { kind: 'error'; message: string }

function UnsubscribePage() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const token =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('token')
      : null

  useEffect(() => {
    if (!token) {
      setState({ kind: 'invalid' })
      return
    }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const json = await r.json().catch(() => ({}))
        if (!r.ok) {
          setState({ kind: 'invalid' })
          return
        }
        if (json.valid) setState({ kind: 'valid' })
        else if (json.reason === 'already_unsubscribed') setState({ kind: 'already' })
        else setState({ kind: 'invalid' })
      })
      .catch(() => setState({ kind: 'error', message: 'No pudimos validar el enlace.' }))
  }, [token])

  const confirm = async () => {
    if (!token) return
    setState({ kind: 'submitting' })
    try {
      const r = await fetch('/email/unsubscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const json = await r.json().catch(() => ({}))
      if (json.success) setState({ kind: 'done' })
      else if (json.reason === 'already_unsubscribed') setState({ kind: 'already' })
      else setState({ kind: 'error', message: json.error || 'No se pudo procesar.' })
    } catch {
      setState({ kind: 'error', message: 'Error de red.' })
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-xl px-6 py-20 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          Cancelar suscripción
        </h1>

        <div className="mt-10 rounded-xl border border-border bg-card p-8">
          {state.kind === 'loading' && (
            <p className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Validando enlace…
            </p>
          )}
          {state.kind === 'valid' && (
            <>
              <p className="text-sm text-muted-foreground">
                ¿Estás seguro de que ya no quieres recibir correos de ContaClick?
              </p>
              <Button className="mt-6" variant="destructive" onClick={confirm}>
                Sí, darme de baja
              </Button>
            </>
          )}
          {state.kind === 'submitting' && (
            <p className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Procesando…
            </p>
          )}
          {state.kind === 'done' && (
            <>
              <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
              <p className="mt-3 font-medium">Listo. Ya no recibirás más correos nuestros.</p>
            </>
          )}
          {state.kind === 'already' && (
            <>
              <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
              <p className="mt-3 font-medium">Este correo ya estaba dado de baja.</p>
            </>
          )}
          {state.kind === 'invalid' && (
            <>
              <XCircle className="mx-auto h-10 w-10 text-destructive" />
              <p className="mt-3 font-medium">El enlace no es válido o expiró.</p>
            </>
          )}
          {state.kind === 'error' && (
            <>
              <XCircle className="mx-auto h-10 w-10 text-destructive" />
              <p className="mt-3 font-medium">{state.message}</p>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
