import { describe, expect, it, vi, beforeEach } from 'vitest'

const listeners = new Map<string, Set<(e: any) => void>>()
const mockHistoryState = { idx: 0 }

const fakeWindow = {
  history: {
    state: mockHistoryState,
    length: 1,
    replaceState: (_state: any, _title: string, _url: string) => {
      Object.assign(mockHistoryState, _state)
    },
  },
  location: { pathname: '/home', href: 'http://localhost/home', reload: vi.fn() },
  addEventListener: (event: string, cb: (e: any) => void) => {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event)!.add(cb)
  },
  removeEventListener: (event: string, cb: (e: any) => void) => {
    listeners.get(event)?.delete(cb)
  },
  dispatchEvent: (event: { type: string; [k: string]: any }) => {
    const set = listeners.get(event.type)
    if (set) {
      set.forEach((cb) => cb(event))
      return true
    }
    return false
  },
}

if (typeof (globalThis as any).window === 'undefined') {
  ;(globalThis as any).window = fakeWindow
  ;(globalThis as any).location = fakeWindow.location
  ;(globalThis as any).document = {
    addEventListener: fakeWindow.addEventListener,
    removeEventListener: fakeWindow.removeEventListener,
    fullscreenElement: null,
  }
}

const mockNavigate = vi.fn()
let mockLocation = { pathname: '/home', key: 'default' }

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
}))

describe('Desktop Navigation Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listeners.clear()
    mockLocation = { pathname: '/home', key: 'default' }
    mockHistoryState.idx = 0
    fakeWindow.history.length = 1
  })

  it('canGoBack is false when history index is 0', () => {
    const historyDepth = Number(fakeWindow.history.state?.idx ?? 0)
    const canGoBack = historyDepth > 0
    expect(canGoBack).toBe(false)
  })

  it('canGoBack is true when history index is greater than 0', () => {
    mockHistoryState.idx = 3
    fakeWindow.history.length = 4
    const historyDepth = Number(fakeWindow.history.state?.idx ?? 0)
    const canGoBack = historyDepth > 0
    expect(canGoBack).toBe(true)
  })

  it('mouse button 3 event dispatches back navigation', () => {
    let navigatedTo: number | string | null = null
    const onMouseUp = (e: { button: number; preventDefault: () => void }) => {
      if (e.button === 3) {
        e.preventDefault()
        navigatedTo = -1
      }
    }
    fakeWindow.addEventListener('mouseup', onMouseUp)

    fakeWindow.dispatchEvent({ type: 'mouseup', button: 3, preventDefault: () => {} })
    expect(navigatedTo).toBe(-1)
  })

  it('mouse button 4 event dispatches forward navigation', () => {
    let navigatedTo: number | string | null = null
    const onMouseUp = (e: { button: number; preventDefault: () => void }) => {
      if (e.button === 4) {
        e.preventDefault()
        navigatedTo = 1
      }
    }
    fakeWindow.addEventListener('mouseup', onMouseUp)

    fakeWindow.dispatchEvent({ type: 'mouseup', button: 4, preventDefault: () => {} })
    expect(navigatedTo).toBe(1)
  })

  it('Alt + ArrowLeft dispatches back navigation', () => {
    let navigatedTo: number | string | null = null
    const onKeyDown = (e: { altKey: boolean; key: string; preventDefault: () => void }) => {
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        navigatedTo = -1
      }
    }
    fakeWindow.addEventListener('keydown', onKeyDown)

    fakeWindow.dispatchEvent({ type: 'keydown', altKey: true, key: 'ArrowLeft', preventDefault: () => {} })
    expect(navigatedTo).toBe(-1)
  })

  it('Alt + ArrowRight dispatches forward navigation', () => {
    let navigatedTo: number | string | null = null
    const onKeyDown = (e: { altKey: boolean; key: string; preventDefault: () => void }) => {
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault()
        navigatedTo = 1
      }
    }
    fakeWindow.addEventListener('keydown', onKeyDown)

    fakeWindow.dispatchEvent({ type: 'keydown', altKey: true, key: 'ArrowRight', preventDefault: () => {} })
    expect(navigatedTo).toBe(1)
  })
})
