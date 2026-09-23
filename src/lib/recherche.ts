const COMBINING_MARKS_START = 0x0300
const COMBINING_MARKS_END = 0x036f

/** Minuscules, sans accents, pour comparer « Cécile » et « cecile ». */
export function normalize(s: string): string {
  const decomposed = s.toLowerCase().normalize('NFD')
  let out = ''
  for (const ch of decomposed) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp < COMBINING_MARKS_START || cp > COMBINING_MARKS_END) out += ch
  }
  // Les tirets et apostrophes séparent des mots au même titre qu'un espace :
  // « Jean-Pierre » doit se trouver en tapant « pierre jean ».
  return out.replace(/[-'’]/g, ' ')
}

function mots(s: string): string[] {
  return normalize(s).split(/\s+/).filter(Boolean)
}

/**
 * Vrai si chaque mot tapé se retrouve dans le texte, dans n'importe quel ordre.
 * Les fiches ne stockant qu'un « nom complet », c'est ce qui permet de trouver
 * « Marie Dupont » aussi bien en tapant « marie dup » que « dupont marie ».
 */
export function correspond(texte: string, requete: string): boolean {
  const recherche = mots(requete)
  if (recherche.length === 0) return true
  const cible = normalize(texte)
  return recherche.every((m) => cible.includes(m))
}

/**
 * Score de pertinence, plus petit = plus pertinent. Sert à remonter en tête la
 * fiche la plus probable plutôt que de s'en remettre à l'ordre alphabétique.
 */
function score(texte: string, requete: string): number {
  const cible = normalize(texte)
  const q = normalize(requete).trim()
  if (cible === q) return 0
  if (cible.startsWith(q)) return 1
  // Un mot de la cible commence par le premier mot tapé (« dup » → « Dupont »).
  const premier = mots(requete)[0] ?? ''
  if (cible.split(/\s+/).some((m) => m.startsWith(premier))) return 2
  return 3
}

/** Filtre puis trie par pertinence, en conservant l'ordre d'origine à égalité. */
export function rechercher<T>(items: T[], requete: string, texteDe: (item: T) => string): T[] {
  if (requete.trim().length === 0) return items
  return items
    .filter((item) => correspond(texteDe(item), requete))
    .map((item, i) => ({ item, i, s: score(texteDe(item), requete) }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((r) => r.item)
}
