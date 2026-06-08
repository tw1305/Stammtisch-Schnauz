import { getPlayerInitials } from '@/lib/game-logic'

type Props = {
  name: string
  avatarUrl?: string | null
  size?: number
  eliminated?: boolean
  isWinner?: boolean
}

export default function PlayerAvatar({ name, avatarUrl, size = 48, eliminated, isWinner }: Props) {
  const initials = getPlayerInitials(name)

  return (
    <div
      className={`relative rounded-full overflow-hidden flex items-center justify-center font-semibold text-[#111111] transition-all
        ${eliminated ? 'opacity-30 grayscale' : ''}
        ${isWinner ? 'ring-4 ring-[#D62839] ring-offset-2 ring-offset-[#111111]' : ''}
      `}
      style={{ width: size, height: size, fontSize: size * 0.35, backgroundColor: '#D62839' }}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span>{initials}</span>
      )}
      {isWinner && (
        <div className="absolute -top-1 -right-1 text-base leading-none">👑</div>
      )}
    </div>
  )
}
