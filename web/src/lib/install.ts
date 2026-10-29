/** "Install Vexa" — Chrome / Edge / Samsung Internet offer this; iPhone uses Share → Add to Home Screen. */
interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallEvent | null = null
const listeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as InstallEvent; listeners.forEach(l => l()) })
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach(l => l()) })
}

export const canInstall = () => !!deferred
export const isInstalled = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)
export const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
export function onInstallChange(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } }

export async function install(): Promise<boolean> {
  if (!deferred) return false
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  listeners.forEach(l => l())
  return outcome === 'accepted'
}
