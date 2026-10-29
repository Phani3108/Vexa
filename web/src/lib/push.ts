import { api } from './api'

/** Web Push on this device (installed app or browser). Needs the service worker, so production builds only. */
export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

function keyBytes(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

export async function pushState(): Promise<'unsupported' | 'denied' | 'on' | 'off'> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error('This browser cannot show notifications. On iPhone, add Vexa to your Home Screen first.')
  const { publicKey } = await api<{ publicKey: string | null }>('/api/push/key')
  if (!publicKey) throw new Error('Notifications are not set up on the server yet')
  if (await Notification.requestPermission() !== 'granted') throw new Error('Notifications were blocked. Allow them in your browser settings.')
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource })
  await api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } })
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await api('/api/push/subscribe', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => {})
  await sub.unsubscribe()
}
