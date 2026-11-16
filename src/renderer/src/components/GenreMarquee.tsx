import { GENRES } from '../lib/constants'
import { useSearch } from '../context/SearchContext'
import { Marquee } from './Marquee'

const MASK = '[mask-image:linear-gradient(to_right,transparent,#000_10%,#000_90%,transparent)]'

/** Two counter-scrolling rows of genre chips; each chip opens search filtered to that genre. */
export function GenreMarquee() {
  const { openSearch } = useSearch()
  const first = GENRES.slice(0, Math.ceil(GENRES.length / 2))
  const second = GENRES.slice(Math.ceil(GENRES.length / 2))

  const chip = (g: { name: string }) => (
    <button
      key={g.name}
      type="button"
      onClick={() => openSearch({ genre: g.name })}
      className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-border/60 bg-card/60 px-5 py-2 text-sm font-medium backdrop-blur transition hover:border-accent/40 hover:bg-card-2 hover:text-foreground active:scale-95 shadow-2xs"
    >
      {g.name}
    </button>
  )

  return (
    <section aria-label="Browse by genre" className="mx-auto w-full max-w-7xl flex flex-col gap-4 overflow-hidden py-2">
      <div className="px-4 sm:px-6">
        <p className="mb-1 eyebrow text-accent flex items-center gap-1.5">
          <span className="inline-block size-1.5 rounded-full bg-accent" />
          Categories
        </p>
        <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight">Browse by Genre</h2>
      </div>
      <div className="flex flex-col gap-3 overflow-hidden">
        <Marquee duration={45} className={MASK}>
          {first.map(chip)}
        </Marquee>
        <Marquee reverse duration={52} className={MASK}>
          {second.map(chip)}
        </Marquee>
      </div>
    </section>
  )
}
