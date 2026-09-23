import { useEffect, useRef, useState } from 'react'
import { rechercher } from '../lib/recherche'

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

const DROPDOWN_MAX_HEIGHT = 288 // px, matches max-h-72

function SearchableSelect({ options, value, onChange, placeholder, emptyLabel }: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [openUpward, setOpenUpward] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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

  function openDropdown() {
    const rect = inputRef.current?.getBoundingClientRect()
    if (rect) {
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      setOpenUpward(spaceBelow < DROPDOWN_MAX_HEIGHT && spaceAbove > spaceBelow)
    }
    setOpen(true)
    // Give the (possibly taller) expanded field room to breathe inside a
    // scrolling modal, so the dropdown itself doesn't end up clipped.
    // Deliberately instant, not smooth: a 300ms animation keeps sliding the
    // freshly-rendered list under her finger, so the tap lands on the wrong
    // row — or on nothing at all.
    inputRef.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
  }

  const filtered = rechercher(options, query, (o) => `${o.label} ${o.sublabel ?? ''}`)

  return (
    <div ref={rootRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={open ? query : (selected?.label ?? '')}
        onChange={(e) => {
          setQuery(e.target.value)
          if (!open) openDropdown()
        }}
        onFocus={openDropdown}
        placeholder={placeholder}
        className="input"
        autoComplete="off"
      />
      {open && (
        <div
          className={`absolute z-10 w-full max-h-72 overflow-y-auto bg-white border border-border rounded-[10px] shadow-lg ${
            openUpward ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
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
                className={`block w-full text-left px-3 py-3.5 text-sm min-h-[44px] hover:bg-sage-pale ${
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
