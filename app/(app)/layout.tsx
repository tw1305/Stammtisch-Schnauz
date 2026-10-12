import BottomNav from '@/components/ui/BottomNav'
import TestModeBanner from '@/components/ui/TestModeBanner'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-dvh bg-[#F4ECDA]">
      <TestModeBanner />
      <main className="flex-1 overflow-y-auto pb-24">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
