import type { CoverState } from 'kehikot-module-protocol/client/react'

/**
 * Whether the page shows what it was opened for: the moment to say `ready()` and have the host take
 * its cover off (protocol 2.70.0).
 *
 * Not while waiting to be greeted, and not while the first read of the notes is out. Drawn: the
 * notes (or none), the store's refusal or trouble, nobody pointing anywhere (`asks` null), the picks
 * emptying the list, or a sentence of the shared cover the page draws itself. Pure, for the tests.
 */
export function drawnOf(at: {
  cover: CoverState | null
  asks: readonly unknown[] | null
  looked: object | null
  refused: string | null
  emptied: string | null
}): boolean {
  if (at.cover) return at.cover !== 'waiting'
  if (at.asks === null || at.asks.length === 0) return true
  return at.looked !== null || at.refused !== null || at.emptied !== null
}
