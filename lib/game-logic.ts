import type { Player, DebtSettlement } from '@/types/database'

export function calculateBalances(playerCount: number, stake: number) {
  const pot = playerCount * stake
  const winnerGain = pot - stake
  const loserLoss = -stake
  return { pot, winnerGain, loserLoss }
}

export function calculateSettlements(
  balances: { player: Player; total: number }[]
): DebtSettlement[] {
  const creditors = balances
    .filter(b => b.total > 0)
    .map(b => ({ ...b }))
    .sort((a, b) => b.total - a.total)

  const debtors = balances
    .filter(b => b.total < 0)
    .map(b => ({ ...b, total: Math.abs(b.total) }))
    .sort((a, b) => b.total - a.total)

  const settlements: DebtSettlement[] = []

  let ci = 0
  let di = 0

  while (ci < creditors.length && di < debtors.length) {
    const amount = Math.min(creditors[ci].total, debtors[di].total)
    if (amount > 0) {
      settlements.push({
        from: debtors[di].player,
        to: creditors[ci].player,
        amount,
      })
    }
    creditors[ci].total -= amount
    debtors[di].total -= amount

    if (creditors[ci].total === 0) ci++
    if (debtors[di].total === 0) di++
  }

  return settlements
}

export function getPlayerInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function formatBalance(amount: number): string {
  if (amount > 0) return `+${amount} €`
  if (amount < 0) return `${amount} €`
  return '0 €'
}

export function getBalanceColor(amount: number): string {
  if (amount > 0) return 'text-[#22C55E]'
  if (amount < 0) return 'text-[#EF4444]'
  return 'text-[#9A9A9A]'
}

export function getCurrentQuarter(): string {
  const now = new Date()
  const q = Math.ceil((now.getMonth() + 1) / 3)
  return `Q${q} ${now.getFullYear()}`
}

export function distributeOnCircle(
  count: number,
  radius: number,
  centerX: number,
  centerY: number
): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    }
  })
}
