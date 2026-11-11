import type { CoverState } from 'kehikot-module-protocol/client/react'

/**
 * Whether the page shows what it was opened for: the moment to say `ready()` and have the host take
 * its cover off (protocol 2.70.0).
 *
 * Not while waiting to be greeted, and not while the first read of the notes is out. Drawn: the
 * notes (or none), the store's refusal or trouble, nobody pointing anywhere (`asks` null), the picks
 * emptying the list, or a sentence of the shared cover the page draws itself. Not while what is on
 * screen answered another question (`stale`: a switch is being read), so the host may cover it again
 * (protocol 2.84.0). Pure, for the tests.
 */
export function drawnOf(at: {
  cover: CoverState | null
  asks: readonly unknown[] | null
  looked: object | null
  refused: string | null
  emptied: string | null
  stale?: boolean
}): boolean {
  if (at.cover) return at.cover !== 'waiting'
  if (at.asks === null || at.asks.length === 0) return true
  if (at.stale) return false
  return at.looked !== null || at.refused !== null || at.emptied !== null
}

/** What the host's cover says while this page reads the notes it shows (protocol 2.84.0). */
export const LOADING_NOTES = 'Loading notes…'
