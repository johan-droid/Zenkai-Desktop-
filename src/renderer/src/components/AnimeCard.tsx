import { memo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Star } from 'lucide-react'
import type { CardItem } from '../types/anime'
import { cn, formatLabel, toScore10 } from '../lib/utils'
import { ListButton } from './ListButton'
import { Img } from './Img'

/**
 * Poster card. Cheap by design: plain CSS animation/hover, a pointer-driven 3D tilt that only runs for a mouse
 * (no React state, no springs) and responsive `srcSet` so phones decode small images.
 */
export const AnimeCard = memo(function AnimeCard({
  item,
  index = 0,
  rank,
  fluid = false,
}: {
  item: CardItem
  index?: number
  rank?: number
  /** Fill the parent width instead of using fixed row widths (for grids). */
  fluid?: boolean
}) {
  const tilt = useRef<HTMLDivElement>(null)
  const raf = useRef(0)

  function onMove(e: React.PointerEvent<HTMLAnchorElement>) {
    if (e.pointerType !== 'mouse') return
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      if (tilt.current) tilt.current.style.transform = `perspective(900px) rotateX(${(0.5 - y) * 14}deg) rotateY(${(x - 0.5) * 14}deg)`
    })
  }
  function onLeave() {
    cancelAnimationFrame(raf.current)
    if (tilt.current) tilt.current.style.transform = ''
  }

  const fmt = formatLabel(item.format)
  const meta = [fmt !== '—' ? fmt : null, item.year, item.episodes ? `${item.episodes} ep` : null].filter(Boolean).join(' · ')

  return (
    <div
      className={cn('group/card relative animate-card-in shrink-0 snap-start', fluid ? 'w-full' : 'w-[148px] sm:w-[178px] lg:w-[196px]')}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <ListButton item={item} variant="icon" />
      <Link to={item.href} onPointerMove={onMove} onPointerLeave={onLeave} className="group block outline-none">
        <div
          ref={tilt}
          style={{ backgroundColor: item.color ?? undefined }}
          className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-border/80 bg-card-2 shadow-lg shadow-black/10 transition-[transform,box-shadow,border-color] duration-300 ease-out group-hover:border-accent/40 group-hover:shadow-2xl group-hover:shadow-accent/15 group-focus-visible:ring-2 group-focus-visible:ring-accent"
        >
          <Img
            src={item.image}
            srcSet={item.image2x ? `${item.image} 230w, ${item.image2x} 460w` : undefined}
            sizes={fluid ? '(min-width:1280px) 16vw, (min-width:640px) 30vw, 46vw' : '(min-width:1024px) 196px, (min-width:640px) 178px, 148px'}
            alt={item.title}
            loading="lazy"
            decoding="async"
            draggable={false}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />

          {item.score ? (
            <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-black/80 backdrop-blur-md border border-white/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300 shadow-md">
              <Star className="size-3 fill-current" />
              {toScore10(item.score)}
            </span>
          ) : null}

          {rank !== undefined && (
            <span className="absolute bottom-1.5 left-2.5 font-display text-5xl font-black leading-none text-white/95 drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
              {rank}
            </span>
          )}

          <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3 opacity-0 backdrop-blur-[1px] transition-all duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
            <div className="flex flex-wrap gap-1">
              {(item.genres ?? []).slice(0, 2).map((g) => (
                <span key={g} className="rounded-full bg-white/20 backdrop-blur-sm px-2 py-0.5 text-[10px] font-medium text-white">
                  {g}
                </span>
              ))}
            </div>
            <span className="mt-2 text-xs font-semibold text-white/90 group-hover:text-white flex items-center gap-1">
              View details <span className="text-accent">→</span>
            </span>
          </div>
        </div>

        <h3 className="mt-2.5 line-clamp-2 text-[13px] font-semibold leading-snug tracking-tight text-foreground transition-colors duration-200 group-hover:text-accent">{item.title}</h3>
        <p className="mt-0.5 truncate text-[11px] font-medium text-muted">{item.caption ?? meta}</p>
      </Link>
    </div>
  )
})
