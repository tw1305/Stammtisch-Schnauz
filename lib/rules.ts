import type { Rule } from '@/types/database'

/**
 * Initial house rules (taken over from the WhatsApp group description), grouped
 * by topic. Seeded into the `rules` table the first time the Regeln tab opens.
 */
export const DEFAULT_RULES: { section: string; title: string; body: string }[] = [
  {
    section: 'Austeilen und Geber',
    title: 'Vergeben des Gebers',
    body: 'Vergibt sich der Geber, zahlt er ein Leben. Dazu zählt auch, wenn er beim Geben eine Karte aufdeckt.',
  },
  {
    section: 'Austeilen und Geber',
    title: 'Unvorsichtiges Austeilen',
    body:
      'Ist der Geber unvorsichtig beim Austeilen und man kann die Karten im Stapel oder die ausgeteilten Karten sehen, ' +
      'hat ein anderer Spieler die Möglichkeit zu sagen, welche Karte genau er gesehen hat. Liegt er richtig, muss der ' +
      'Geber ein Leben zahlen. Liegt er falsch, muss er selbst ein Leben zahlen.',
  },
  {
    section: 'Austeilen und Geber',
    title: 'Hinweise an den Geber',
    body:
      'Wenn jemand während des Austeilens dem Geber einen Hinweis gibt, während er sich vergibt oder jemanden ' +
      'wiederbelebt, muss dieser Spieler ein Leben zahlen.',
  },
  {
    section: 'Wiederbelebung',
    title: 'Zeitpunkt der Wiederbelebung',
    body: 'Man ist wiederbelebt, sobald der Geber jedem Spieler eine Karte ausgeteilt hat.',
  },
  {
    section: 'Spielablauf',
    title: 'Gelegte Karten',
    body: 'Was liegt des bappt',
  },
  {
    section: 'Spielablauf',
    title: 'Schieben',
    body: 'Man darf nur einmal schieben.',
  },
  {
    section: 'Spielablauf',
    title: 'Schnauz und Feuer',
    body: 'Schnauz und Feuer dürfen nicht in die Hand genommen werden, andernfalls muss ein Leben gezahlt werden.',
  },
  {
    section: 'Kartenwerte',
    title: 'Kleine Straße',
    body: '7-8-9 gleiche Farbe ist eine kleine Straße, Wert: 28,5',
  },
  {
    section: 'Sorgfalt mit Karten und Leben',
    title: 'Herunterfallen',
    body: 'Fällt jemandem eine Karte oder ein Leben auf den Boden, muss er ein Leben zahlen.',
  },
  {
    section: 'Sorgfalt mit Karten und Leben',
    title: 'Beschädigung',
    body: 'Wird eine Karte oder das Kartendeck beschädigt, muss ein Leben gezahlt werden.',
  },
]

/** Gap between sort_order values, leaving room to insert without renumbering. */
export const SORT_STEP = 10

export type RuleSection = { name: string; rules: (Rule & { paragraph: number })[] }

/**
 * Visible rules grouped into sections in display order. Sections appear in the
 * order of their first rule; paragraphs (§) are numbered continuously across the
 * whole rulebook, like in a statute.
 */
export function groupRules(rules: Rule[]): RuleSection[] {
  const visible = rules.filter(r => !r.deleted_at).sort((a, b) => a.sort_order - b.sort_order)
  const sections: RuleSection[] = []
  for (const r of visible) {
    let s = sections.find(x => x.name === r.section)
    if (!s) {
      s = { name: r.section, rules: [] }
      sections.push(s)
    }
    s.rules.push({ ...r, paragraph: 0 })
  }
  let n = 0
  for (const s of sections) for (const r of s.rules) r.paragraph = ++n
  return sections
}

/** Flattened display order (sections kept together), used when reordering. */
export function displayOrder(rules: Rule[]): Rule[] {
  return groupRules(rules).flatMap(s => s.rules)
}

/** "Stand" of the rulebook: the latest change, including deletions. */
export function rulesLastChanged(rules: Rule[]): Date | null {
  let max = 0
  for (const r of rules) {
    const t = Math.max(new Date(r.updated_at).getTime(), r.deleted_at ? new Date(r.deleted_at).getTime() : 0)
    if (t > max) max = t
  }
  return max > 0 ? new Date(max) : null
}

export function toRoman(n: number): string {
  const map: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ]
  let out = ''
  for (const [v, s] of map) while (n >= v) { out += s; n -= v }
  return out
}
