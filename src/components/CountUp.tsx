import { useEffect, useRef, useState } from 'react'

// Animates a whole number from its previous value to the new one.
export default function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    if (reduced) {
      from.current = value
      return
    }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      const v = Math.round(a + (value - a) * eased)
      setShown(v)
      from.current = v
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration, reduced])
  return <>{reduced ? value : shown}</>
}
