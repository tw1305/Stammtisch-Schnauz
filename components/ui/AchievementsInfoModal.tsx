'use client'

import Portal from './Portal'
import { ACHIEVEMENTS } from '@/lib/stats'

export default function AchievementsInfoModal({ onClose }: { onClose: () => void }) {
  return (
    <Portal>
      <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[100] flex items-end animate-fade-in" onClick={onClose}>
        <div
          className="w-full max-w-md mx-auto bg-[#FBF6EA] rounded-t-3xl border-t border-[#E4D9BF] max-h-[85vh] flex flex-col animate-pop-in"
          onClick={e => e.stopPropagation()}
        >
          <div
            className="px-5 py-5 text-center border-b border-[#E4D9BF]"
            style={{ background: 'linear-gradient(160deg, rgba(46,107,58,0.16), rgba(255,253,247,0.6))' }}
          >
            <div className="text-4xl mb-1.5">🏅</div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#23201A]">Achievements</h2>
            <p className="text-[#7C7461] text-sm mt-1">
              Werden pro Season an den jeweiligen Spitzenreiter vergeben. Bei Gleichstand bekommen alle Führenden die
              Auszeichnung.
            </p>
          </div>

          <div className="overflow-y-auto flex-1 px-4 py-3 divide-y divide-[#E4D9BF]">
            {ACHIEVEMENTS.map(a => (
              <div key={a.label} className="flex items-center gap-3 px-1 py-2.5">
                <span className="text-2xl w-9 text-center shrink-0">{a.icon}</span>
                <div className="min-w-0">
                  <p className="text-[#23201A] font-semibold leading-tight">{a.label}</p>
                  <p className="text-[#7C7461] text-xs leading-snug">{a.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] border-t border-[#E4D9BF]">
            <button
              onClick={onClose}
              className="w-full bg-[#2E6B3A] hover:bg-[#3A8049] text-white font-semibold rounded-2xl py-3.5 transition-colors"
            >
              Schließen
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
