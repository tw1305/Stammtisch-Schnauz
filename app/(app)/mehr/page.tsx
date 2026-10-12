import Link from 'next/link'
import { APP_VERSION } from '@/lib/patchnotes'

const ITEMS = [
  { href: '/regeln', icon: '📜', title: 'Regeln', desc: 'Das offizielle Regelwerk des Stammtischs' },
  { href: '/patchnotes', icon: '📰', title: 'Patch Notes', desc: `Was ist neu? · Version ${APP_VERSION}` },
  { href: '/einstellungen', icon: '⚙️', title: 'Einstellungen', desc: 'Basiseinsatz, Sound & Vibration, Animationen' },
]

export default function MehrPage() {
  return (
    <div className="flex flex-col max-w-md mx-auto w-full px-4">
      <div className="pt-6 pb-4">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[#23201A] tracking-tight">Mehr</h1>
      </div>

      <div className="space-y-2.5">
        {ITEMS.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3.5 bg-[#FBF6EA] border border-[#E4D9BF] rounded-2xl px-4 py-4 hover:border-[#2E6B3A]/50 transition-colors"
          >
            <span className="w-11 h-11 rounded-xl bg-[#FFFDF7] border border-[#E4D9BF] flex items-center justify-center text-xl shrink-0">
              {item.icon}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[#23201A] font-semibold">{item.title}</span>
              <span className="block text-[#7C7461] text-xs mt-0.5">{item.desc}</span>
            </span>
            <span className="text-[#7C7461] text-xl leading-none">›</span>
          </Link>
        ))}
      </div>

      <p className="text-center text-[#B0A084] text-xs mt-8">Stammtisch Schnauz · Version {APP_VERSION}</p>
      <p className="text-center text-[#B0A084] text-[10px] leading-relaxed mt-3 px-4 pb-4">
        Sounds: Feuer „fire explosion“ von readeonly; Furzgeräusche von crimsonblaze, aetherzip, teddyferguson,
        zott820, delphidebrain, bassimat, timtube, frenkfurth, under7dude u. a. – alle via freesound.org.
        Siegessound: 50 Cent – „I Get Money“.
      </p>
    </div>
  )
}
