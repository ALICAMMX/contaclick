import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  name?: string
  message?: string
}

const ContactConfirmation = ({ name, message }: Props) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Recibimos tu mensaje en ContaClick · Te contactamos en menos de 24 hrs</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>¡Gracias por escribirnos{name ? `, ${name}` : ''}!</Heading>
        <Text style={p}>
          Recibimos tu mensaje y un asesor de <strong>ContaClick</strong> te
          responderá en menos de <strong>24 horas hábiles</strong>.
        </Text>

        {message ? (
          <>
            <Text style={label}>Esto fue lo que nos enviaste:</Text>
            <Section style={quoteBox}>
              <Text style={quoteText}>{message}</Text>
            </Section>
          </>
        ) : null}

        <Text style={p}>
          Si necesitas atención inmediata, también puedes escribirnos por
          WhatsApp:{' '}
          <Link href="https://wa.me/5215545282044" style={linkStyle}>
            +52 1 55 4528 2044
          </Link>
        </Text>

        <Hr style={hr} />
        <Text style={footer}>
          ContaClick — Automatización fiscal y contable para despachos
          mexicanos.
          <br />
          <Link href="https://contaclick.cloud" style={linkStyle}>
            contaclick.cloud
          </Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ContactConfirmation,
  subject: 'Recibimos tu mensaje en ContaClick',
  displayName: 'Confirmación de contacto',
  previewData: {
    name: 'Juan',
    message: 'Quisiera agendar una demo de ContaClick para mi despacho.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '32px 24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', color: '#0f172a', margin: '0 0 12px' }
const p = { fontSize: '15px', color: '#334155', lineHeight: '1.6', margin: '0 0 16px' }
const label = { fontSize: '13px', color: '#64748b', margin: '16px 0 6px' }
const quoteBox = {
  backgroundColor: '#f1f5f9',
  borderLeft: '3px solid #2563eb',
  padding: '12px 16px',
  borderRadius: '4px',
}
const quoteText = {
  fontSize: '14px',
  color: '#0f172a',
  whiteSpace: 'pre-wrap' as const,
  lineHeight: '1.6',
  margin: 0,
}
const linkStyle = { color: '#2563eb', textDecoration: 'underline' }
const hr = { borderColor: '#e2e8f0', margin: '24px 0 12px' }
const footer = { fontSize: '12px', color: '#94a3b8', textAlign: 'center' as const, lineHeight: '1.6' }
