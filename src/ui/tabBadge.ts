/**
 * Browser-tab notification for due sessions: a red dot composited onto the
 * favicon (visible even among many tabs), a "(n)" title prefix, and — when
 * installed as a PWA — the OS app-icon badge via the Badging API.
 */

const BASE_TITLE = document.title

let baseIconHref: string | null = null
let dotHref: string | null = null // composed favicon, cached after first draw
let wantDot = false

export function updateTabBadge(dueCount: number): void {
  document.title = dueCount > 0 ? `(${dueCount}) ${BASE_TITLE}` : BASE_TITLE

  const nav = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>
    clearAppBadge?: () => Promise<void>
  }
  if (dueCount > 0) nav.setAppBadge?.(dueCount).catch(() => {})
  else nav.clearAppBadge?.().catch(() => {})

  setFaviconDot(dueCount > 0)
}

function setFaviconDot(show: boolean): void {
  wantDot = show
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) return
  baseIconHref ??= link.href

  if (!show) {
    link.href = baseIconHref
    return
  }
  if (dotHref) {
    link.href = dotHref
    return
  }

  const img = new Image()
  img.onload = () => {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(img, 0, 0, size, size)
    // Punch out a transparent ring first so the dot stays legible on any icon.
    const r = 13
    const cx = size - r - 1
    const cy = r + 1
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.arc(cx, cy, r + 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#e5544b'
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    dotHref = canvas.toDataURL('image/png')
    // The count may have changed while the image was loading.
    if (wantDot) link.href = dotHref
  }
  img.src = baseIconHref
}
