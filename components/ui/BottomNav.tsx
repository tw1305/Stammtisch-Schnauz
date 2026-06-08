'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/spiel', label: 'Spiel', icon: '🃏' },
  { href: '/statistiken', label: 'Statistiken', icon: '📊' },
  { href: '/seasons', label: 'Seasons', icon: '🏆' },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#1C1C1C] border-t border-[#2E2E2E] pb-safe z-50">
      <div className="flex">
        {tabs.map(tab => {
          const active = pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 transition-colors min-h-[56px] ${
                active ? 'text-[#D4A017]' : 'text-[#9A9A9A]'
              }`}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              <span className="text-[10px] font-medium tracking-wide">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
