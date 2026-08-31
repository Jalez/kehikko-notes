import { useEffect, useState } from 'react'

import { ROOMY, roomFor, type Room } from '../../notes/room.ts'

/**
 * The box this page is in, watched, turned into the decision in `notes/room.ts`.
 *
 * ## Why there is any JavaScript here at all
 *
 * Width is a container query and stays one: `@sm/container:p-3` measures the
 * body without a render and cannot be wrong. Height has no such thing. A
 * container query answers about an ELEMENT's containing block, and what decides
 * how much of this list a person can see is the frame's viewport — the box the
 * canvas dragged out — which no element in this document is. `100dvh` can
 * make a layout fill it; it cannot tell the layout how tall it turned out to be.
 *
 * So the frame is measured, once per change, and the ONE thing measured is the
 * viewport: `innerWidth` and `innerHeight`. Not the root element's box, which
 * is a value this page decides and would therefore be this page reading its own
 * output back — the shape of every layout loop ever written.
 *
 * ## Both events, and neither is redundant
 *
 * A frame resized by its host fires `resize` in the framed document, and every
 * browser this runs in does. The observer is for the case that does not: a
 * container whose size changed while this document was doing something else, and
 * the first load, where `resize` never fires at all and the initial read is
 * therefore the one that has to be right. `ResizeObserver` fires once on
 * observe, which makes the first measurement an event like any other rather
 * than a value read at the wrong moment during mount.
 *
 * Guarded because these tests run in a DOM that has neither.
 */
export function useRoom(): Room {
  const [room, setRoom] = useState<Room>(() =>
    typeof window === 'undefined' ? ROOMY : roomFor({ width: window.innerWidth, height: window.innerHeight }),
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const measure = () => {
      const now = roomFor({ width: window.innerWidth, height: window.innerHeight })
      /* Replaced only when it says something different. `roomFor` builds a
         fresh object every time, and a new identity on every scroll-driven
         resize event would rebuild every row on the page to draw the same
         thing. */
      setRoom((was) => (same(was, now) ? was : now))
    }
    measure()
    window.addEventListener('resize', measure)
    const watcher =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure())
    watcher?.observe(document.documentElement)
    return () => {
      window.removeEventListener('resize', measure)
      watcher?.disconnect()
    }
  }, [])

  return room
}

/** Field by field, because the object is rebuilt on every measurement. */
function same(a: Room, b: Room): boolean {
  return (
    a.compact === b.compact
    && a.bodyLines === b.bodyLines
    && a.quoteLines === b.quoteLines
    && a.provenance === b.provenance
    && a.where === b.where
    && a.author === b.author
    && a.said === b.said
    && a.actions === b.actions
    && a.notices === b.notices
    && a.compose === b.compose
    && a.snap === b.snap
  )
}
