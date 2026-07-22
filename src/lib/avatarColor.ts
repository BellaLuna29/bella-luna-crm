const PALETTE = [
  'bg-sage-dark',
  'bg-avatar-mauve',
  'bg-avatar-indigo',
  'bg-avatar-forest',
  'bg-gold',
  'bg-avatar-teal',
  'bg-danger',
]

export function avatarColorClass(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  const index = Math.abs(hash) % PALETTE.length
  return PALETTE[index]
}
