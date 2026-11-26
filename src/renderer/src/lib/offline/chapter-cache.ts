/**
 * Offline Chapter Storage & Cache Engine for Manga and Novels.
 *
 * Implements local-first storage using standard browser IndexedDB with
 * automatic in-memory fallback for non-DOM / test environments.
 */

export interface OfflineChapterRecord {
  /** Composite key: `${kind}:${mediaId}:${unit}` */
  id: string
  kind: 'manga' | 'novel'
  mediaId: string
  unit: number
  title: string
  pages?: string[]
  content?: string
  cachedAt: number
  sizeBytes?: number
}

const DB_NAME = 'zenkai_offline'
const DB_VERSION = 1
const STORE_NAME = 'offline_chapters'

let idbPromise: Promise<IDBDatabase> | null = null
const memoryStore = new Map<string, OfflineChapterRecord>()

function hasIndexedDB(): boolean {
  return typeof globalThis !== 'undefined' && typeof globalThis.indexedDB !== 'undefined'
}

function openDatabase(): Promise<IDBDatabase> {
  if (idbPromise) return idbPromise

  idbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!hasIndexedDB()) {
      reject(new Error('IndexedDB is unavailable in this environment'))
      return
    }

    const req = globalThis.indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = (_event) => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('kind_mediaId', ['kind', 'mediaId'], { unique: false })
        store.createIndex('unit', 'unit', { unique: false })
      }
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

  return idbPromise
}

export function offlineChapterId(kind: 'manga' | 'novel', mediaId: string, unit: number): string {
  return `${kind}:${mediaId}:${unit}`
}

/**
 * Cache a manga chapter for offline reading.
 */
export async function saveMangaChapterOffline(params: {
  mediaId: string
  unit: number
  title: string
  pages: string[]
}): Promise<OfflineChapterRecord> {
  const id = offlineChapterId('manga', params.mediaId, params.unit)
  const record: OfflineChapterRecord = {
    id,
    kind: 'manga',
    mediaId: params.mediaId,
    unit: params.unit,
    title: params.title,
    pages: params.pages,
    cachedAt: Date.now(),
    sizeBytes: params.pages.reduce((acc, p) => acc + p.length, 0),
  }

  if (!hasIndexedDB()) {
    memoryStore.set(id, record)
    return record
  }

  const db = await openDatabase()
  return new Promise<OfflineChapterRecord>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.put(record)
    req.onsuccess = () => resolve(record)
    req.onerror = () => reject(req.error)
  })
}

/**
 * Cache a novel chapter for offline reading.
 */
export async function saveNovelChapterOffline(params: {
  mediaId: string
  unit: number
  title: string
  content: string
}): Promise<OfflineChapterRecord> {
  const id = offlineChapterId('novel', params.mediaId, params.unit)
  const record: OfflineChapterRecord = {
    id,
    kind: 'novel',
    mediaId: params.mediaId,
    unit: params.unit,
    title: params.title,
    content: params.content,
    cachedAt: Date.now(),
    sizeBytes: new TextEncoder().encode(params.content).length,
  }

  if (!hasIndexedDB()) {
    memoryStore.set(id, record)
    return record
  }

  const db = await openDatabase()
  return new Promise<OfflineChapterRecord>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.put(record)
    req.onsuccess = () => resolve(record)
    req.onerror = () => reject(req.error)
  })
}

/**
 * Retrieve cached chapter if available.
 */
export async function getOfflineChapter(
  kind: 'manga' | 'novel',
  mediaId: string,
  unit: number,
): Promise<OfflineChapterRecord | null> {
  const id = offlineChapterId(kind, mediaId, unit)

  if (!hasIndexedDB()) {
    return memoryStore.get(id) ?? null
  }

  const db = await openDatabase()
  return new Promise<OfflineChapterRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.get(id)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error)
  })
}

/**
 * Check if a chapter is available offline.
 */
export async function isChapterOffline(
  kind: 'manga' | 'novel',
  mediaId: string,
  unit: number,
): Promise<boolean> {
  const cached = await getOfflineChapter(kind, mediaId, unit)
  return Boolean(cached)
}

/**
 * Delete a cached chapter from offline storage.
 */
export async function deleteOfflineChapter(
  kind: 'manga' | 'novel',
  mediaId: string,
  unit: number,
): Promise<boolean> {
  const id = offlineChapterId(kind, mediaId, unit)

  if (!hasIndexedDB()) {
    memoryStore.delete(id)
    return true
  }

  const db = await openDatabase()
  return new Promise<boolean>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.delete(id)
    req.onsuccess = () => resolve(true)
    req.onerror = () => reject(req.error)
  })
}

/**
 * List all offline chapters for a specific manga or novel, sorted by unit.
 */
export async function listOfflineChapters(
  kind: 'manga' | 'novel',
  mediaId: string,
): Promise<OfflineChapterRecord[]> {
  if (!hasIndexedDB()) {
    return Array.from(memoryStore.values())
      .filter((r) => r.kind === kind && r.mediaId === mediaId)
      .sort((a, b) => a.unit - b.unit)
  }

  const db = await openDatabase()
  return new Promise<OfflineChapterRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('kind_mediaId')
    const req = index.getAll([kind, mediaId])

    req.onsuccess = () => {
      const records: OfflineChapterRecord[] = req.result || []
      records.sort((a, b) => a.unit - b.unit)
      resolve(records)
    }
    req.onerror = () => reject(req.error)
  })
}
