import * as React from 'react'
import { render } from 'react-email'
import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { TEMPLATES } from '@/lib/email-templates/registry'

const SITE_NAME = 'contaclick'
const SENDER_DOMAIN = 'soporte.contaclick.cloud'
const FROM_DOMAIN = 'contaclick.cloud'

const ContactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  telefono: z.string().trim().max(40).optional().default(''),
  despacho: z.string().trim().max(160).optional().default(''),
  message: z.string().trim().min(5).max(2000),
})

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function enqueueTemplate(opts: {
  supabase: ReturnType<typeof createClient>
  templateName: string
  recipientEmail: string
  templateData: Record<string, any>
  idempotencyKey: string
}) {
  const { supabase, templateName, recipientEmail, templateData, idempotencyKey } = opts
  const entry = TEMPLATES[templateName]
  if (!entry) throw new Error(`Template '${templateName}' not registered`)

  const effectiveRecipient = entry.to || recipientEmail
  const normalized = effectiveRecipient.toLowerCase()
  const messageId = crypto.randomUUID()

  // Suppression check
  const { data: suppressed } = await supabase
    .from('suppressed_emails')
    .select('id')
    .eq('email', normalized)
    .maybeSingle()

  if (suppressed) {
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'suppressed',
    })
    return { skipped: true as const, reason: 'suppressed' }
  }

  // Unsubscribe token (reuse if exists)
  let unsubscribeToken: string
  const { data: existingToken } = await supabase
    .from('email_unsubscribe_tokens')
    .select('token, used_at')
    .eq('email', normalized)
    .maybeSingle()

  if (existingToken?.token && !existingToken.used_at) {
    unsubscribeToken = existingToken.token as string
  } else {
    unsubscribeToken = generateToken()
    await supabase
      .from('email_unsubscribe_tokens')
      .upsert(
        { token: unsubscribeToken, email: normalized },
        { onConflict: 'email', ignoreDuplicates: true },
      )
    const { data: stored } = await supabase
      .from('email_unsubscribe_tokens')
      .select('token')
      .eq('email', normalized)
      .maybeSingle()
    if (stored?.token) unsubscribeToken = stored.token as string
  }

  // Render
  const element = React.createElement(entry.component, templateData)
  const html = await render(element)
  const text = await render(element, { plainText: true })
  const subject =
    typeof entry.subject === 'function' ? entry.subject(templateData) : entry.subject

  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: templateName,
    recipient_email: effectiveRecipient,
    status: 'pending',
  })

  const { error: enqueueError } = await supabase.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to: effectiveRecipient,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text,
      purpose: 'transactional',
      label: templateName,
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  })

  if (enqueueError) {
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'failed',
      error_message: 'Failed to enqueue email',
    })
    throw new Error('enqueue_failed')
  }

  return { skipped: false as const, messageId }
}

export const Route = createFileRoute('/api/public/contact')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!supabaseUrl || !serviceKey) {
          return Response.json({ error: 'Server configuration error' }, { status: 500 })
        }

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON' }, { status: 400 })
        }

        const parsed = ContactSchema.safeParse(body)
        if (!parsed.success) {
          return Response.json(
            { error: 'Invalid input', issues: parsed.error.flatten() },
            { status: 400 },
          )
        }

        const data = parsed.data
        const supabase = createClient(supabaseUrl, serviceKey)
        const submittedAt = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })
        const baseKey = `${data.email}-${Date.now()}`

        try {
          // 1) Notify admin
          await enqueueTemplate({
            supabase,
            templateName: 'contact-notification',
            recipientEmail: 'admin@contaclick.cloud', // overridden by template.to
            idempotencyKey: `contact-notify-${baseKey}`,
            templateData: {
              name: data.name,
              email: data.email,
              telefono: data.telefono,
              despacho: data.despacho,
              message: data.message,
              submittedAt,
            },
          })

          // 2) Confirmation to user
          await enqueueTemplate({
            supabase,
            templateName: 'contact-confirmation',
            recipientEmail: data.email,
            idempotencyKey: `contact-confirm-${baseKey}`,
            templateData: { name: data.name, message: data.message },
          })

          return Response.json({ success: true })
        } catch (err) {
          console.error('Contact form failed', err)
          return Response.json(
            { error: 'No pudimos procesar tu mensaje. Intenta de nuevo.' },
            { status: 500 },
          )
        }
      },
    },
  },
})
