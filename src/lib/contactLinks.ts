export function buildSmsLink(telephone: string, body: string): string {
  const digits = telephone.replace(/[^\d+]/g, '')
  return `sms:${digits}?body=${encodeURIComponent(body)}`
}

export function buildMailtoLink(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
