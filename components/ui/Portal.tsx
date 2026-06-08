'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders children into document.body so overlays sit above the fixed bottom nav
 * regardless of the surrounding stacking context.
 */
export default function Portal({ children }: { children: React.ReactNode }) {
  const [el] = useState(() =>
    typeof document !== 'undefined' ? document.createElement('div') : null
  )

  useEffect(() => {
    if (!el) return
    document.body.appendChild(el)
    return () => {
      document.body.removeChild(el)
    }
  }, [el])

  if (!el) return null
  return createPortal(children, el)
}
