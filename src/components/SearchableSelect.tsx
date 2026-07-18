import { useEffect, useRef, useState } from 'react'

export interface SearchableOption {
  id: string
  label: string
  sublabel?: string
}

interface SearchableSelectProps {
  options: SearchableOption[]
  value: string
  onChange: (id: string) => void
  placeholder: string
  emptyLabel?: string
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

function SearchableSelect({ options, value, onChange, placeholder, emptyLabel }: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.id === value)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filtered =
    query.trim().length === 0
      ? options
      : options.filter((o) => normalize(o.label).includes(normalize(query)))

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        value={open ? query : (selected?.label ?? '')}
        onChange={(e) => {
          setQuery(e.target.value)
          if (!open) setOpen(true)
        }}
        onFocus={() => {
          setOpen(true)
          setQuery('')
        }}
        placeholder={placeholder}
        className="input"
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-border rounded-[10px] shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2.5 text-sm text-text-muted">
              {emptyLabel ?? 'Aucun résultat.'}
            </div>
          ) : (
            filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onChange(o.id)
                  setOpen(false)
                  setQuery('')
                }}
                className={`block w-full text-left px-3 py-2.5 text-sm hover:bg-sage-pale ${
                  o.id === value ? 'bg-sage-light font-semibold text-sage-dark' : ''
                }`}
              >
                {o.label}
                {o.sublabel && <span className="text-text-muted"> — {o.sublabel}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default SearchableSelect
