import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { isTyping, isBackKey } from '../lib/keys'

export function useDesktopNavigation() {
  const navigate = useNavigate()
  const location = useLocation()

  const [historyDepth, setHistoryDepth] = useState(() => {
    if (typeof window === 'undefined') return 0
    return Number(window.history.state?.idx ?? 0)
  })

  // Track max observed depth to infer forward availability
  const [maxDepth, setMaxDepth] = useState(() => {
    if (typeof window === 'undefined') return 0
    return Number(window.history.state?.idx ?? 0)
  })

  useEffect(() => {
    const currentIdx = Number(window.history.state?.idx ?? 0)
    setHistoryDepth(currentIdx)
    setMaxDepth((prev) => Math.max(prev, currentIdx))
  }, [location.key])

  const canGoBack = historyDepth > 0 || (typeof window !== 'undefined' && window.history.length > 1)
  const canGoForward = historyDepth < maxDepth

  const goBack = useCallback(() => {
    if (historyDepth > 0 || (typeof window !== 'undefined' && window.history.length > 1)) {
      navigate(-1)
    } else {
      navigate('/home')
    }
  }, [historyDepth, navigate])

  const goForward = useCallback(() => {
    navigate(1)
  }, [navigate])

  const reload = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }, [])

  // Mouse 4/5 & Alt+Arrow navigation listeners
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleMouseUp = (e: MouseEvent) => {
      // Button 3 is Back (XButton1), Button 4 is Forward (XButton2)
      if (e.button === 3) {
        e.preventDefault()
        e.stopPropagation()
        goBack()
      } else if (e.button === 4) {
        e.preventDefault()
        e.stopPropagation()
        goForward()
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return

      // Alt + Left Arrow -> Back
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        goBack()
      }
      // Alt + Right Arrow -> Forward
      else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault()
        goForward()
      }
      // Dedicated Back remote or OS key
      else if (isBackKey(e)) {
        e.preventDefault()
        goBack()
      }
    }

    window.addEventListener('mouseup', handleMouseUp, true)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('mouseup', handleMouseUp, true)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [goBack, goForward])

  return {
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    reload,
  }
}
