import Link from 'next/link'

/** Page header with a back link to the "Mehr" hub (Regeln, Patch Notes, …). */
export default function BackHeader({ title, href = '/mehr', children }: { title: string; href?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 pt-5 pb-3">
      <Link
        href={href}
        aria-label="Zurück"
        className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#FFFDF7] text-[#23201A] text-2xl transition-colors"
      >
        ‹
      </Link>
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#23201A] tracking-tight flex-1">{title}</h1>
      {children}
    </div>
  )
}
