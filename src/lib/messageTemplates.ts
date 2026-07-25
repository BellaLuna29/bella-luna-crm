import { apiFetch } from './api'

export interface SmsTemplate {
  id: string
  cle: string
  libelle: string
  corps: string
}

export interface EmailTemplate {
  id: string
  cle: string
  libelle: string
  objet: string
  corps: string
}

type GetToken = () => Promise<string | null>

export async function fetchSmsTemplates(getToken: GetToken): Promise<SmsTemplate[]> {
  const data = await apiFetch<{ templates: SmsTemplate[] }>(getToken, '/api/prestations?resource=sms-templates')
  return data.templates
}

export async function fetchEmailTemplates(getToken: GetToken): Promise<EmailTemplate[]> {
  const data = await apiFetch<{ templates: EmailTemplate[] }>(getToken, '/api/prestations?resource=email-templates')
  return data.templates
}
