const KEY = 'bella-luna-dismissed-alerts'

function readSet(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function writeSet(set: Set<string>): void {
  localStorage.setItem(KEY, JSON.stringify(Array.from(set)))
}

export function getDismissedSet(): Set<string> {
  return readSet()
}

export function dismissAlert(id: string): void {
  const set = readSet()
  set.add(id)
  writeSet(set)
}
