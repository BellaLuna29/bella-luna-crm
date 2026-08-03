import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../lib/api'
import Icon from './Icon'
import { avatarColorClass } from '../lib/avatarColor'

interface Client {
  id: string
  nomComplet: string
  telephone: string
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

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

const MAX_RESULTS = 8

interface GlobalClientSearchProps {
  onSelectClient: (id: string) => void
}

function GlobalClientSearch({ onSelectClient }: GlobalClientSearchProps) {
  const { getToken } = useAuth()
  const [clients, setClients] = useState<Client[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const loadedRef = useRef(false)

  function ensureLoaded() {
    if (loadedRef.current) return
    loadedRef.current = true
    apiFetch<{ clients: Client[] }>(getToken, '/api/clients')
      .then((data) => setClients(data.clients))
      .catch(() => {
        loadedRef.current = false
      })
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const results =
    query.trim().length === 0
      ? []
      : clients.filter((c) => normalize(c.nomComplet).includes(normalize(query))).slice(0, MAX_RESULTS)

  function pick(id: string) {
    onSelectClient(id)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative w-full">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
          <Icon name="search" size={16} />
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            ensureLoaded()
            setOpen(true)
          }}
          placeholder="Rechercher une cliente..."
          className="input pl-9"
          autoComplete="off"
        />
      </div>
      {open && query.trim().length > 0 && (
        <div className="absolute right-0 z-20 mt-1 w-full max-h-80 overflow-y-auto bg-white border border-border rounded-[10px] shadow-lg">
          {results.length === 0 ? (
            <div className="px-3 py-2.5 text-sm text-text-muted">Aucune cliente trouvée.</div>
          ) : (
            results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c.id)}
                className="flex w-full items-center gap-2.5 text-left px-3 py-2.5 text-sm min-h-[44px] hover:bg-sage-pale"
              >
                <span
                  className={`w-7 h-7 rounded-full text-white flex items-center justify-center font-semibold text-[11px] shrink-0 ${avatarColorClass(c.nomComplet || c.id)}`}
                >
                  {initials(c.nomComplet || '?')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold truncate">{c.nomComplet}</span>
                  {c.telephone && <span className="block text-xs text-text-muted truncate">{c.telephone}</span>}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default GlobalClientSearch
