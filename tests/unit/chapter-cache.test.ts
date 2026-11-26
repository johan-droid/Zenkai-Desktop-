import { describe, expect, it } from 'vitest'
import {
  saveMangaChapterOffline,
  saveNovelChapterOffline,
  getOfflineChapter,
  isChapterOffline,
  deleteOfflineChapter,
  listOfflineChapters,
  offlineChapterId,
} from '../../src/renderer/src/lib/offline/chapter-cache'

describe('Manga and Novel offline chapter cache', () => {
  it('generates consistent composite IDs', () => {
    expect(offlineChapterId('manga', 'one-piece', 1000)).toBe('manga:one-piece:1000')
    expect(offlineChapterId('novel', 'solo-leveling', 50)).toBe('novel:solo-leveling:50')
  })

  it('saves and retrieves manga chapters offline', async () => {
    const saved = await saveMangaChapterOffline({
      mediaId: 'naruto',
      unit: 1,
      title: 'Chapter 1: Uzumaki Naruto',
      pages: ['https://cdn.example/p1.jpg', 'https://cdn.example/p2.jpg'],
    })

    expect(saved.id).toBe('manga:naruto:1')
    expect(saved.pages?.length).toBe(2)

    const isOffline = await isChapterOffline('manga', 'naruto', 1)
    expect(isOffline).toBe(true)

    const retrieved = await getOfflineChapter('manga', 'naruto', 1)
    expect(retrieved).not.toBeNull()
    expect(retrieved?.title).toBe('Chapter 1: Uzumaki Naruto')
    expect(retrieved?.pages).toEqual(['https://cdn.example/p1.jpg', 'https://cdn.example/p2.jpg'])
  })

  it('saves and retrieves novel chapters offline', async () => {
    const text = 'Paragraph 1\n\nParagraph 2\n\nParagraph 3'
    const saved = await saveNovelChapterOffline({
      mediaId: 'lord-of-the-mysteries',
      unit: 1,
      title: 'Chapter 1: Crimson',
      content: text,
    })

    expect(saved.id).toBe('novel:lord-of-the-mysteries:1')
    expect(saved.content).toBe(text)

    const retrieved = await getOfflineChapter('novel', 'lord-of-the-mysteries', 1)
    expect(retrieved).not.toBeNull()
    expect(retrieved?.title).toBe('Chapter 1: Crimson')
    expect(retrieved?.content).toBe(text)
  })

  it('lists cached chapters sorted by unit', async () => {
    await saveMangaChapterOffline({
      mediaId: 'bleach',
      unit: 10,
      title: 'Chapter 10',
      pages: ['p1'],
    })
    await saveMangaChapterOffline({
      mediaId: 'bleach',
      unit: 2,
      title: 'Chapter 2',
      pages: ['p1'],
    })
    await saveMangaChapterOffline({
      mediaId: 'bleach',
      unit: 5,
      title: 'Chapter 5',
      pages: ['p1'],
    })

    const list = await listOfflineChapters('manga', 'bleach')
    expect(list.length).toBe(3)
    expect(list.map((c) => c.unit)).toEqual([2, 5, 10])
  })

  it('deletes offline chapters cleanly', async () => {
    await saveNovelChapterOffline({
      mediaId: 'temp-novel',
      unit: 1,
      title: 'Temp Chapter',
      content: 'Sample',
    })

    expect(await isChapterOffline('novel', 'temp-novel', 1)).toBe(true)

    const deleted = await deleteOfflineChapter('novel', 'temp-novel', 1)
    expect(deleted).toBe(true)

    expect(await isChapterOffline('novel', 'temp-novel', 1)).toBe(false)
    expect(await getOfflineChapter('novel', 'temp-novel', 1)).toBeNull()
  })
})
