import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../lib/api'
import { fetchSmsTemplates, fetchEmailTemplates, type SmsTemplate, type EmailTemplate } from '../lib/messageTemplates'
import { renderTemplate, type TemplateContext } from '../lib/templateEngine'
import { buildSmsLink, buildMailtoLink } from '../lib/contactLinks'
import { logCommunication } from '../lib/communicationsLog'

interface Questionnaire {
  id: string
  nom: string
  categorie: string
  lien: string
}

interface MessageComposerModalProps {
  context: TemplateContext
  telephone: string
  email: string
  initialTemplateKey?: string
  onClose: () => void
}

const COMBINING_MARKS_START = 0x0300
const COMBINING_MARKS_END = 0x036f

function normalize(s: string): string {
  const decomposed = s.toLowerCase().normalize('NFD')
  let out = ''
  for (const ch of decomposed) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp < COMBINING_MARKS_START || cp > COMBINING_MARKS_END) out += ch
  }
  return out
}

function findBestQuestionnaire(questionnaires: Questionnaire[], prestation?: string): Questionnaire | null {
  if (!prestation || questionnaires.length === 0) return null
  const p = normalize(prestation)
  for (const q of questionnaires) {
    const cat = normalize(q.categorie)
    const nom = normalize(q.nom)
    if ((cat && (p.includes(cat) || cat.includes(p))) || (nom && (p.includes(nom) || nom.includes(p)))) {
      return q
    }
  }
  return null
}

function pickInitial<T extends { cle: string }>(items: T[], key?: string): T | null {
  if (items.length === 0) return null
  return items.find((t) => t.cle === key) ?? items[0]
}

function MessageComposerModal({ context, telephone, email, initialTemplateKey, onClose }: MessageComposerModalProps) {
  const { getToken } = useAuth()
  const [smsTemplates, setSmsTemplates] = useState<SmsTemplate[]>([])
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([])
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([])
  const [questionnaireId, setQuestionnaireId] = useState('')
  const [smsTemplateId, setSmsTemplateId] = useState('')
  const [emailTemplateId, setEmailTemplateId] = useState('')
  const [smsBody, setSmsBody] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetchSmsTemplates(getToken),
      fetchEmailTemplates(getToken),
      apiFetch<{ questionnaires: Questionnaire[] }>(getToken, '/api/prestations?resource=questionnaires').catch(
        () => ({ questionnaires: [] as Questionnaire[] }),
      ),
    ])
      .then(([sms, mails, qData]) => {
        setSmsTemplates(sms)
        setEmailTemplates(mails)
        setQuestionnaires(qData.questionnaires)

        const bestQuestionnaire = findBestQuestionnaire(qData.questionnaires, context.prestation)
        const lienQuestionnaire = bestQuestionnaire?.lien
        if (bestQuestionnaire) setQuestionnaireId(bestQuestionnaire.id)

        const smsInitial = pickInitial(sms, initialTemplateKey)
        if (smsInitial) {
          setSmsTemplateId(smsInitial.id)
          setSmsBody(renderTemplate(smsInitial.corps, { ...context, lienQuestionnaire }))
        }
        const emailInitial = pickInitial(mails, initialTemplateKey)
        if (emailInitial) {
          setEmailTemplateId(emailInitial.id)
          setEmailSubject(emailInitial.objet)
          setEmailBody(renderTemplate(emailInitial.corps, { ...context, lienQuestionnaire }))
        }
      })
      .catch(() => setLoadError('Impossible de charger les modèles de message.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function currentLien(nextQuestionnaireId: string): string | undefined {
    return questionnaires.find((q) => q.id === nextQuestionnaireId)?.lien
  }

  function handleSmsTemplateChange(id: string) {
    setSmsTemplateId(id)
    const t = smsTemplates.find((tpl) => tpl.id === id)
    if (t) setSmsBody(renderTemplate(t.corps, { ...context, lienQuestionnaire: currentLien(questionnaireId) }))
  }

  function handleEmailTemplateChange(id: string) {
    setEmailTemplateId(id)
    const t = emailTemplates.find((tpl) => tpl.id === id)
    if (t) {
      setEmailSubject(t.objet)
      setEmailBody(renderTemplate(t.corps, { ...context, lienQuestionnaire: currentLien(questionnaireId) }))
    }
  }

  function handleQuestionnaireChange(id: string) {
    setQuestionnaireId(id)
    const lien = currentLien(id)
    const smsT = smsTemplates.find((tpl) => tpl.id === smsTemplateId)
    if (smsT) setSmsBody(renderTemplate(smsT.corps, { ...context, lienQuestionnaire: lien }))
    const mailT = emailTemplates.find((tpl) => tpl.id === emailTemplateId)
    if (mailT) setEmailBody(renderTemplate(mailT.corps, { ...context, lienQuestionnaire: lien }))
  }

  const smsHref = telephone ? buildSmsLink(telephone, smsBody) : null
  const mailHref = email ? buildMailtoLink(email, emailSubject, emailBody) : null
  const smsLabel = smsTemplates.find((t) => t.id === smsTemplateId)?.libelle ?? 'SMS'
  const emailLabel = emailTemplates.find((t) => t.id === emailTemplateId)?.libelle ?? 'E-mail'

  function logSend(type: 'SMS' | 'Email') {
    const label = type === 'SMS' ? smsLabel : emailLabel
    logCommunication(getToken, { contenu: `${label} — ${context.nomComplet}`, type, destinataires: 1 }).catch(() => {
      // best effort — l'historique ne sera juste pas mis à jour
    })
  }

  const showQuestionnairePicker = questionnaires.length > 0

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <h3 className="font-serif text-xl font-semibold text-sage-dark mb-1">Contacter {context.nomComplet}</h3>
        <p className="text-xs text-text-muted mb-4">
          Prépare le message puis ouvre l'app SMS ou Mail de ta tablette pour l'envoyer.
        </p>

        {loadError && <p className="text-sm text-danger mb-3">{loadError}</p>}

        {showQuestionnairePicker && (
          <label className="block mb-4">
            <span className="block text-xs font-semibold text-text-muted mb-1">Formulaire à insérer</span>
            <select value={questionnaireId} onChange={(e) => handleQuestionnaireChange(e.target.value)} className="input">
              <option value="">Aucun (garder « [Lien à insérer] »)</option>
              {questionnaires.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.nom}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="border border-border rounded-2xl p-4 mb-4">
          <div className="text-xs font-semibold text-sage-dark uppercase tracking-wide mb-3">Message SMS</div>
          <label className="block mb-3">
            <span className="block text-xs font-semibold text-text-muted mb-1">Modèle</span>
            <select value={smsTemplateId} onChange={(e) => handleSmsTemplateChange(e.target.value)} className="input">
              {smsTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.libelle}
                </option>
              ))}
            </select>
          </label>
          <textarea
            value={smsBody}
            onChange={(e) => setSmsBody(e.target.value)}
            rows={5}
            className="input resize-none"
          />
        </div>

        <div className="border border-border rounded-2xl p-4 mb-4">
          <div className="text-xs font-semibold text-sage-dark uppercase tracking-wide mb-3">Message e-mail</div>
          <label className="block mb-3">
            <span className="block text-xs font-semibold text-text-muted mb-1">Modèle</span>
            <select value={emailTemplateId} onChange={(e) => handleEmailTemplateChange(e.target.value)} className="input">
              {emailTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.libelle}
                </option>
              ))}
            </select>
          </label>
          <label className="block mb-3">
            <span className="block text-xs font-semibold text-text-muted mb-1">Objet</span>
            <input type="text" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className="input" />
          </label>
          <textarea
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
            rows={8}
            className="input resize-none"
          />
        </div>

        {!telephone && !email && (
          <p className="text-sm text-danger mb-3">Aucun téléphone ni e-mail enregistré pour cette cliente.</p>
        )}

        <div className="flex justify-end gap-3 flex-wrap">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-[10px] text-sm font-semibold text-text-muted hover:bg-sage-pale"
          >
            Fermer
          </button>
          {mailHref && (
            <a
              href={mailHref}
              onClick={() => logSend('Email')}
              className="bg-white border border-border text-sage-dark px-5 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-sage-pale"
            >
              Ouvrir par e-mail
            </a>
          )}
          {smsHref && (
            <a
              href={smsHref}
              onClick={() => logSend('SMS')}
              className="bg-sage-dark text-white px-5 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-sage-dark/90"
            >
              Ouvrir par SMS
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

export default MessageComposerModal
