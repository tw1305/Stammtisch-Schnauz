'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

function CardIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="4" width="11" height="16" rx="2" stroke={active ? '#D62839' : '#9A9A9A'} strokeWidth="1.8" fill={active ? '#D62839' : 'none'} fillOpacity={active ? '0.15' : '0'}/>
      <rect x="10" y="6" width="11" height="16" rx="2" stroke={active ? '#D62839' : '#9A9A9A'} strokeWidth="1.8" fill={active ? '#D62839' : 'none'} fillOpacity={active ? '0.1' : '0'}/>
      <text x="6" y="15" fontSize="7" fill={active ? '#D62839' : '#9A9A9A'} fontFamily="serif" fontWeight="bold">♥</text>
    </svg>
  )
}

function ChartIcon({ active }: { active: boolean }) {
  const c = active ? '#D62839' : '#9A9A9A'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="13" width="4" height="7" rx="1" fill={c} fillOpacity={active ? '1' : '0.6'}/>
      <rect x="10" y="8" width="4" height="12" rx="1" fill={c} fillOpacity={active ? '1' : '0.6'}/>
      <rect x="16" y="4" width="4" height="16" rx="1" fill={c} fillOpacity={active ? '1' : '0.6'}/>
    </svg>
  )
}

function TrophyIcon({ active }: { active: boolean }) {
  const c = active ? '#D62839' : '#9A9A9A'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 21h8M12 17v4M7 3H5a2 2 0 000 4c0 2 1.5 3.5 3 4M17 3h2a2 2 0 010 4c0 2-1.5 3.5-3 4" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M7 3h10v7a5 5 0 01-10 0V3z" stroke={c} strokeWidth="1.8" fill={active ? '#D62839' : 'none'} fillOpacity={active ? '0.15' : '0'}/>
    </svg>
  )
}

const tabs = [
  { href: '/spiel', label: 'Spiel', Icon: CardIcon },
  { href: '/statistiken', label: 'Statistiken', Icon: ChartIcon },
  { href: '/seasons', label: 'Seasons', Icon: TrophyIcon },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#1C1C1C] border-t border-[#2E2E2E] pb-safe z-50">
      <div className="flex">
        {tabs.map(({ href, label, Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors min-h-[60px]"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors
                ${active
                  ? 'border-[#D62839] bg-[#D62839]/10'
                  : 'border-[#2E2E2E] bg-transparent'
                }`}
              >
                <Icon active={active} />
              </div>
              <span className={`text-[10px] font-medium tracking-wide leading-none ${active ? 'text-[#D62839]' : 'text-[#9A9A9A]'}`}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
