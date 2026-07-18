import { useState } from 'react'
import { MESSAGE_TEMPLATES, type TemplateContext } from '../lib/messageTemplates'
import { buildSmsLink, buildMailtoLink } from '../lib/contactLinks'

interface MessageComposerModalProps {
  context: TemplateContext
  telephone: string
  email: string
  initialTemplateKey?: string
  onClose: () => void
}

function MessageComposerModal({ context, telephone, email, initialTemplateKey, onClose }: MessageComposerModalProps) {
  const initialTemplate = MESSAGE_TEMPLATES.find((t) => t.key === initialTemplateKey) ?? MESSAGE_TEMPLATES[0]
  const [templateKey, setTemplateKey] = useState(initialTemplate.key)
  const [body, setBody] = useState(initialTemplate.build(context))
  const template = MESSAGE_TEMPLATES.find((t) => t.key === templateKey) ?? MESSAGE_TEMPLATES[0]

  function handleTemplateChange(key: string) {
    setTemplateKey(key)
    const t = MESSAGE_TEMPLATES.find((tpl) => tpl.key === key)
    if (t) setBody(t.build(context))
  }

  const smsHref = telephone ? buildSmsLink(telephone, body) : null
  const mailHref = email ? buildMailtoLink(email, template.subject, body) : null

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <h3 className="font-serif text-xl font-semibold text-sage-dark mb-1">Contacter {context.nomComplet}</h3>
        <p className="text-xs text-text-muted mb-4">
          Prépare le message puis ouvre l'app SMS ou Mail de ta tablette pour l'envoyer.
        </p>

        <label className="block mb-3">
          <span className="block text-xs font-semibold text-text-muted mb-1">Modèle</span>
          <select value={templateKey} onChange={(e) => handleTemplateChange(e.target.value)} className="input">
            {MESSAGE_TEMPLATES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block mb-4">
          <span className="block text-xs font-semibold text-text-muted mb-1">Message</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className="input resize-none"
          />
        </label>

        {!telephone && !email && (
          <p className="text-sm text-danger mb-3">Aucun téléphone ni email enregistré pour cette cliente.</p>
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
              className="bg-white border border-border text-sage-dark px-5 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-sage-pale"
            >
              Ouvrir par e-mail
            </a>
          )}
          {smsHref && (
            <a
              href={smsHref}
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
