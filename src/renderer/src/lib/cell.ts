/**
 * A tiny observable localStorage cell. Snapshots are cached so useSyncExternalStore stays stable.
 */
export function cell<T>(key: string, empty: T) {
  let raw: string | null | undefined
  let val = empty
  let memOnly = false // storage blocked (private mode): keep working in memory
  const subs = new Set<() => void>()
  const notify = () => subs.forEach((f) => f())

  const get = (): T => {
    if (memOnly) return val
    let r: string | null = null
    try {
      r = localStorage.getItem(key)
    } catch {
      memOnly = true
      return val
    }
    if (r !== raw) {
      raw = r
      try {
        val = r ? (JSON.parse(r) as T) : empty
      } catch {
        val = empty // corrupt value: start clean instead of crashing the app
      }
    }
    return val
  }
  const set = (v: T) => {
    val = v
    try {
      raw = JSON.stringify(v)
      localStorage.setItem(key, raw)
    } catch {
      memOnly = true
    }
    notify()
  }
  const subscribe = (f: () => void) => {
    subs.add(f)
    const onStorage = (e: StorageEvent) => e.key === key && notify()
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage)
    }
    return () => {
      subs.delete(f)
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage)
      }
    }
  }
  return { get, set, subscribe }
}
