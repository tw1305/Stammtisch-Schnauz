'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type IconProps = { active: boolean }
const stroke = (a: boolean) => (a ? '#6366F1' : '#8B95A7')

function CardIcon({ active }: IconProps) {
  const c = stroke(active)
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="9.5" y="5" width="11" height="15" rx="2.5" stroke={c} strokeWidth="1.7" fill={active ? '#6366F1' : 'none'} fillOpacity={active ? 0.12 : 0} transform="rotate(8 15 12)" />
      <rect x="3.5" y="4" width="11" height="15" rx="2.5" stroke={c} strokeWidth="1.7" fill={active ? '#6366F1' : 'none'} fillOpacity={active ? 0.18 : 0} transform="rotate(-8 9 11)" />
      <path d="M9 9.2c-1.1-1.4-3-.5-3 .9 0 1.2 1.7 2.3 3 3.1 1.3-.8 3-1.9 3-3.1 0-1.4-1.9-2.3-3-.9z" fill={c} />
    </svg>
  )
}

function PeopleIcon({ active }: IconProps) {
  const c = stroke(active)
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="8" r="3.2" stroke={c} strokeWidth="1.7" fill={active ? '#6366F1' : 'none'} fillOpacity={active ? 0.15 : 0} />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke={c} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M16 6.2a2.8 2.8 0 010 5.2M17.5 19c0-2.3-1-4-2.5-4.7" stroke={c} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function ChartIcon({ active }: IconProps) {
  const c = stroke(active)
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="13" width="4" height="7" rx="1.2" fill={c} fillOpacity={active ? 1 : 0.7} />
      <rect x="10" y="8" width="4" height="12" rx="1.2" fill={c} fillOpacity={active ? 1 : 0.7} />
      <rect x="16" y="4" width="4" height="16" rx="1.2" fill={c} fillOpacity={active ? 1 : 0.7} />
    </svg>
  )
}

function TrophyIcon({ active }: IconProps) {
  const c = stroke(active)
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M8 21h8M12 17v4M7 4H5a2 2 0 000 4c.3 1.7 1.5 3.2 3 3.7M17 4h2a2 2 0 010 4c-.3 1.7-1.5 3.2-3 3.7" stroke={c} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M7 3.5h10V9a5 5 0 01-10 0V3.5z" stroke={c} strokeWidth="1.7" fill={active ? '#6366F1' : 'none'} fillOpacity={active ? 0.15 : 0} strokeLinejoin="round" />
    </svg>
  )
}

const tabs = [
  { href: '/spiel', label: 'Spiel', Icon: CardIcon },
  { href: '/spieler', label: 'Spieler', Icon: PeopleIcon },
  { href: '/statistiken', label: 'Statistik', Icon: ChartIcon },
  { href: '/seasons', label: 'Seasons', Icon: TrophyIcon },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#141925]/95 backdrop-blur-lg border-t border-[#2A3344] pb-safe z-50">
      <div className="flex max-w-md mx-auto">
        {tabs.map(({ href, label, Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center pt-3 pb-2.5 gap-1.5 min-h-[68px]"
            >
              <div
                className={`w-14 h-9 rounded-full flex items-center justify-center transition-colors duration-200 ${
                  active ? 'bg-[#6366F1]/15' : 'bg-transparent'
                }`}
              >
                <Icon active={active} />
              </div>
              <span
                className={`text-[11px] font-semibold tracking-wide leading-none transition-colors ${
                  active ? 'text-[#6366F1]' : 'text-[#8B95A7]'
                }`}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
