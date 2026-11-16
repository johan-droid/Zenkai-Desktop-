import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { CardItem } from '../types/anime'
import { AnimeCard } from './AnimeCard'
import { ErrorState } from './ErrorState'
import { Skeleton } from './Skeleton'

/** Titled, horizontally scrollable shelf of anime cards with snap + arrow controls. */
export function AnimeRow({
  id,
  eyebrow,
  title,
  items,
  loading = false,
  error,
  onRetry,
  ranked = false,
  viewAll,
}: {
  id?: string
  eyebrow?: string
  title: string
  items?: CardItem[]
  loading?: boolean
  error?: string
  onRetry?: () => void
  ranked?: boolean
  /** route of the full catalogue page for this shelf */
  viewAll?: string
}) {
  const scroller = useRef<HTMLDivElement>(null)

  function scroll(dir: 1 | -1) {
    const el = scroller.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' })
  }

  if (!loading && !error && (!items || items.length === 0)) return null

  return (
    <section id={id} className="cv-auto mx-auto w-full max-w-7xl">
      <div className="mb-4 sm:mb-5 flex items-end justify-between gap-4 px-4 sm:px-6">
        <div>
          {eyebrow && (
            <p className="mb-1 eyebrow text-accent flex items-center gap-1.5">
              <span className="inline-block size-1.5 rounded-full bg-accent" />
              {eyebrow}
            </p>
          )}
          <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {viewAll && (
            <Link
              to={viewAll}
              className="rounded-full border border-border/70 bg-card/50 px-3.5 py-1.5 text-xs font-semibold text-foreground/80 transition hover:border-accent/50 hover:bg-card-2 hover:text-accent active:scale-95 shadow-2xs"
            >
              View all
            </Link>
          )}
          <div className="hidden gap-1.5 md:flex">
            <button
              type="button"
              aria-label={`Scroll ${title} left`}
              onClick={() => scroll(-1)}
              className="grid size-9 place-items-center rounded-full border border-border/60 bg-card/60 backdrop-blur-sm text-muted hover:text-foreground hover:border-accent/40 hover:bg-card-2 transition active:scale-90 shadow-2xs"
            >
              <ChevronLeft className="size-4.5" />
            </button>
            <button
              type="button"
              aria-label={`Scroll ${title} right`}
              onClick={() => scroll(1)}
              className="grid size-9 place-items-center rounded-full border border-border/60 bg-card/60 backdrop-blur-sm text-muted hover:text-foreground hover:border-accent/40 hover:bg-card-2 transition active:scale-90 shadow-2xs"
            >
              <ChevronRight className="size-4.5" />
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="px-4 sm:px-6">
          <ErrorState message={error} onRetry={onRetry} />
        </div>
      ) : (
        <div
          ref={scroller}
          className="no-scrollbar flex snap-x snap-proximity scroll-pl-4 scroll-pr-4 gap-4 overflow-x-auto scroll-smooth px-4 pb-4 pt-2 sm:scroll-pl-6 sm:scroll-pr-6 sm:gap-5 sm:px-6"
        >
          {loading || !items
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="w-[148px] shrink-0 sm:w-[178px] lg:w-[196px]">
                  <Skeleton className="aspect-[2/3] w-full rounded-2xl" />
                  <Skeleton className="mt-3 h-4 w-4/5" />
                  <Skeleton className="mt-2 h-3 w-1/2" />
                </div>
              ))
            : items.map((item, i) => (
                <AnimeCard key={item.id} item={item} index={i} rank={ranked ? i + 1 : undefined} />
              ))}
        </div>
      )}
    </section>
  )
}
