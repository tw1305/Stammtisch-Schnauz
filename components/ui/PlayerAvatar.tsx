import { getPlayerInitials } from '@/lib/game-logic'
import { isBirthdayWeek } from '@/lib/birthday'
import LaurelWreath from './LaurelWreath'

const GRADIENTS: [string, string][] = [
  ['#6366F1', '#8B5CF6'],
  ['#0EA5E9', '#6366F1'],
  ['#14B8A6', '#0EA5E9'],
  ['#F59E0B', '#F43F5E'],
  ['#EC4899', '#8B5CF6'],
  ['#10B981', '#14B8A6'],
  ['#F43F5E', '#EC4899'],
  ['#8B5CF6', '#6366F1'],
  ['#22D3EE', '#3B82F6'],
]

function gradientFor(name: string): [string, string] {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return GRADIENTS[h % GRADIENTS.length]
}

type Props = {
  name: string
  avatarUrl?: string | null
  size?: number
  eliminated?: boolean
  isWinner?: boolean
  birthday?: string | null
}

export default function PlayerAvatar({ name, avatarUrl, size = 48, eliminated, isWinner, birthday }: Props) {
  const initials = getPlayerInitials(name)
  const [c1, c2] = gradientFor(name)
  const celebrate = isBirthdayWeek(birthday) && !eliminated

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className={`w-full h-full rounded-full flex items-center justify-center font-semibold text-white overflow-hidden transition-all duration-200
          ${eliminated ? 'opacity-30 grayscale' : ''}
          ${isWinner ? 'ring-[3px] ring-[#2E6B3A] ring-offset-2 ring-offset-[#F4ECDA]' : ''}
        `}
        style={{
          fontSize: size * 0.36,
          background: avatarUrl ? '#FFFDF7' : `linear-gradient(135deg, ${c1}, ${c2})`,
          boxShadow: isWinner ? '0 0 22px rgba(46,107,58,0.45)' : undefined,
        }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span style={{ fontFamily: 'var(--font-display)' }}>{initials}</span>
        )}
      </div>

      {celebrate && (
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10"
          style={{ width: size * 1.5, height: size * 1.5 }}
        >
          <LaurelWreath />
        </div>
      )}

      {isWinner && (
        <div className="absolute -top-1.5 -right-1.5 text-base leading-none drop-shadow-md z-20">👑</div>
      )}
    </div>
  )
}
