import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  name?: string
  email?: string
  telefono?: string
  despacho?: string
  message?: string
  submittedAt?: string
}

const ContactNotification = ({
  name = 'Sin nombre',
  email = 'sin-correo@desconocido.com',
  telefono,
  despacho,
  message = '(sin mensaje)',
  submittedAt,
}: Props) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Nuevo mensaje de {name} desde el formulario de contacto</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Nuevo contacto desde ContaClick</Heading>
        <Text style={subtitle}>
          Alguien dejó sus datos en el formulario de la web.
        </Text>

        <Section style={card}>
          <Row label="Nombre" value={name} />
          <Row label="Correo" value={email} />
          <Row label="Teléfono" value={telefono || '(no proporcionado)'} />
          <Row label="Despacho / Empresa" value={despacho || '(no proporcionado)'} />
        </Section>

        <Heading as="h2" style={h2}>Mensaje</Heading>
        <Section style={messageBox}>
          <Text style={messageText}>{message}</Text>
        </Section>

        <Hr style={hr} />
        <Text style={footer}>
          Enviado desde contaclick.cloud {submittedAt ? `· ${submittedAt}` : ''}
        </Text>
      </Container>
    </Body>
  </Html>
)

const Row = ({ label, value }: { label: string; value: string }) => (
  <Text style={rowStyle}>
    <strong style={{ color: '#0f172a' }}>{label}:</strong>{' '}
    <span style={{ color: '#334155' }}>{value}</span>
  </Text>
)

export const template = {
  component: ContactNotification,
  subject: (data: Record<string, any>) =>
    `Nuevo contacto: ${data?.name || 'Anónimo'}`,
  displayName: 'Notificación de contacto (interno)',
  to: '2020alicam@gmail.com',
  previewData: {
    name: 'Juan Pérez',
    email: 'juan@despacho.com',
    telefono: '55 1234 5678',
    despacho: 'Despacho Pérez & Asociados',
    message: 'Quisiera agendar una demo de ContaClick para mi despacho.',
    submittedAt: new Date().toLocaleString('es-MX'),
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '32px 24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', color: '#0f172a', margin: '0 0 8px' }
const h2 = { fontSize: '16px', color: '#0f172a', margin: '24px 0 8px' }
const subtitle = { fontSize: '14px', color: '#64748b', margin: '0 0 16px' }
const card = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '16px 20px',
}
const rowStyle = { fontSize: '14px', margin: '6px 0', lineHeight: '1.5' }
const messageBox = {
  backgroundColor: '#f1f5f9',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '16px 20px',
}
const messageText = {
  fontSize: '14px',
  color: '#0f172a',
  whiteSpace: 'pre-wrap' as const,
  lineHeight: '1.6',
  margin: 0,
}
const hr = { borderColor: '#e2e8f0', margin: '24px 0 12px' }
const footer = { fontSize: '12px', color: '#94a3b8', textAlign: 'center' as const }
