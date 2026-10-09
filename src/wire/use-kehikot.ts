import { useMemo, useRef } from 'react'

import { sameParts, type EpicPart, type FilterChoice, type FilterGroup, type ModuleContext } from 'kehikot-module-protocol'

import type { HostEvents } from 'kehikot-module-protocol/client'
import { useHost, type Where } from 'kehikot-module-protocol/client/react'

/**
 * The bridge, as one React value — the protocol's `useHost`, and the three things this page needs
 * on top of it.
 *
 * `useHost` is the listener: the greeting and its grace (`listening` → `unhosted` or `hosted`),
 * the theme put on `<html>`, the flattened project / path / epic, `passage.set`, a page that
 * reloads itself when it is older than its server. None of that is typed out here any more.
 *
 * ## What stays here, and why
 *
 * `useHost` hands back each context's `passage`, `filters`, `parts` and `containers` by the
 * IDENTITY the host sent them with, and a host builds every one of those afresh on every context —
 * after every change anywhere on the canvas, about every two seconds. In this page each of them is
 * a dependency of the memo that decides what to ask this app's own store, so a fresh identity with
 * the same contents means re-asking the store for the same notes several times a second. So:
 *
 * - `passage`, `chosen` and `parts` are **settled**: the previous object is handed on again while
 *   the new one says the same thing (`same`, `agrees`, the protocol's `sameParts`).
 * - `containers` is **one JSON string** of only what this page reads, so "did the canvas move" is a
 *   string comparison. See the field below.
 *
 * ## The passage is handed on whole and never remembered
 *
 * The one rule with teeth: `passage` follows every context, including when it is null, and the
 * page never keeps the last one. A container that held onto the last passage would go on showing
 * the notes on a chapter the reader closed ten minutes ago — indistinguishable, on screen, from
 * the chapter still being open. Settling compares; it does not remember.
 */
export type { Where }

/** A passage, as the context carries one. */
export type Passage = NonNullable<ModuleContext['passage']>

export interface Kehikot {
  where: Where
  /** What the project is called, as the host says it. Null when nobody has said. */
  project: string | null
  /** Where that project is on disk. What this app's store is actually partitioned by. */
  projectPath: string | null
  /**
   * Where the reader is pointing, or null.
   *
   * Where somebody is pointing, which is usually somebody else. This page can
   * now point too — pressing a note does it — and the field is read the same way
   * whoever set it: it is the host's answer about the canvas, not a memory of
   * what this page asked for. A press that the host refuses changes nothing
   * here, which is the correct outcome and the reason the two are not one
   * variable.
   *
   * Null whenever nothing on the canvas is showing a document. That is not a
   * broken state and the page must not draw it as one — see `Nowhere` in
   * `src/view/screens.tsx`.
   */
  passage: Passage | null
  /**
   * Which of the filters this page offered are chosen for THIS container.
   *
   * `{}` before any host has said anything, and `{}` from a host that has never
   * heard of filters — which is the true answer in both cases: nothing is
   * narrowed. `notes/sift.ts` reads it, and reads it leniently, because the
   * greeting carries a remembered choice before this page has said what it
   * offers.
   *
   * Compared field by field before it is written, for the same reason `passage`
   * is: a context arrives after every change anywhere on the canvas, carrying a
   * fresh object every time, and a new identity here means re-asking this app's
   * own store for the same notes several times a second.
   */
  chosen: FilterChoice
  /**
   * Every container on the kehikko, whether it is picked out, and what
   * documents it says it is showing, as the host last said — flattened to ONE
   * STRING, for the reason the passage is compared field by field: a context
   * arrives after every change anywhere on the canvas, and a fresh array of
   * fresh rows each time would re-ask this app's store for the same notes
   * several times a second. `notes/aim.ts` reads it; `App` inflates it once.
   *
   * `''` is no containers: nothing is framing this page, or a host too old to
   * say. Both are answered the same way — the page follows the reader as it
   * always did, and offers no control for a narrowing it cannot do.
   *
   * Read structurally rather than off `ModuleContext`, so that this page
   * typechecks against a copy of the protocol from before the field existed
   * and simply finds nothing there — which is also what the wire does: an
   * older client strips the field before this page sees it.
   */
  containers: string
  /** The open epic's slug, or null. Read for one thing: which paper a part's files are files of. */
  epic: string | null
  /**
   * `context.parts`: every part of the open epic, the ones a person ticked in
   * the host's bar flagged. `[]` before any greeting and from a host that has
   * never heard of parts — nothing picked, the whole epic. Kept by value, for
   * the reason `passage` is: the same array until the list actually changes.
   */
  parts: readonly EpicPart[]
  /** Say how tall this page would like its frame to be. Silent when nothing is framing it. */
  resize: (height: number) => void
  /**
   * Say what this page can be narrowed by, so the host can draw the control.
   *
   * Fire and forget, like `resize`: the host may draw the offer, may draw part
   * of it, or may never have heard of the idea. What comes back is not an
   * answer but a context with `filters` in it.
   *
   * Stable across renders, so the effect that sends the offer can depend on the
   * one thing that makes the offer change — which here is a COUNT, because one
   * of the labels carries one. The client replays the last offer after every
   * greeting, so a page that stopped sending would still be drawn correctly
   * after a reload; a page whose count has changed must send again itself.
   */
  filters: (groups: FilterGroup[]) => void
  /**
   * Point every container on the canvas at a passage.
   *
   * ## This module asks for this, and it used to argue that it must not
   *
   * The manifest's essay called `passage:set` "the interesting omission": this
   * app is the CONSUMER of a passage, and asking to set one would be "asking
   * for permission to move every other container on the canvas, in a module whose
   * whole job is to answer a question about where somebody else is already
   * pointing."
   *
   * That was right about the default and wrong about the exception, and the
   * user found the exception in one sentence: "when you click on a note
   * shouldn't it highlight and show what its target from the paper?" A note IS
   * a passage — a path, a page, a range and the words — written down by somebody
   * who was pointing at it once. Pressing one is a person pointing at it again,
   * and this module holds the only record of where it was.
   *
   * So the rule stands with its exception named: this app never points on a
   * context, on a load, on a filter or on anything it decided by itself. It
   * points when somebody presses a note. The same file's argument against
   * `view:navigate` had already said where this would land — "the honest
   * version of that feature is a `passage.set` in the other direction, and it
   * is not built yet". It is now.
   *
   * Fire and forget, and every refusal is swallowed. A host that never learned
   * the method, or has not greeted this page yet, is not a fault in the note
   * somebody just pressed and not something they can do anything about; what it
   * must not do is throw a rejection out of a click handler.
   */
  point: (passage: Passage | null) => void
}

/**
 * What to do when the host says "go to this reference".
 *
 * Handed in rather than handled here, because the answer depends on what is on
 * screen, and that is the view's business. The contract is the protocol's:
 * `answer` must be called, and calling it late is the same as not calling it —
 * see `GOTO_BACKSTOP_MS` in the protocol's client.
 */
export type GotoHandler = NonNullable<HostEvents['onGoto']>

export function useKehikot(id: string, onGoto: GotoHandler): Kehikot {
  const host = useHost(id, { onGoto })
  const passage = useSettled<Passage | null>(host.passage, same)
  const chosen = useSettled<FilterChoice>(host.chosen, agrees)
  const parts = useSettled<readonly EpicPart[]>(host.parts, sameParts)
  /* A string, which is what makes it stable: an unmoved canvas flattens to the same characters,
     and equal strings are the same dependency. */
  const containers = flattenContainers(host.containers)
  const { where, project, projectPath, epic, resize, filters, point } = host

  return useMemo(
    () => ({ where, project, projectPath, passage, chosen, containers, epic, parts, resize, filters, point }),
    [where, project, projectPath, passage, chosen, containers, epic, parts, resize, filters, point],
  )
}

/**
 * The previous value, for as long as the next one says the same thing.
 *
 * A ref written during render, which is safe here because it is idempotent: rendering twice with
 * the same input leaves the same value held.
 */
function useSettled<T>(next: T, equal: (a: T, b: T) => boolean): T {
  const held = useRef(next)
  if (held.current !== next && !equal(held.current, next)) held.current = next
  return held.current
}


/**
 * The host's containers as one string, or `''`.
 *
 * Only what this page reads survives: the module, the flag, and each document
 * as its path, page and range. Refs are dropped — a note is never filed
 * against one — and so is the quote, for the reason `same` ignores nothing
 * else: this page compares places, and the quote is what happened to be
 * there.
 */
function flattenContainers(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return ''
  const rows = value.flatMap((one) => {
    if (typeof one !== 'object' || one === null) return []
    const row = one as { module?: unknown; selected?: unknown; showing?: unknown }
    if (typeof row.module !== 'string' || !row.module) return []
    const showing = (typeof row.showing === 'object' && row.showing !== null ? row.showing : {}) as {
      documents?: unknown
    }
    const documents = Array.isArray(showing.documents)
      ? showing.documents.flatMap((d) => {
          const doc = d as { path?: unknown; page?: unknown; from?: unknown; to?: unknown } | null
          if (!doc || typeof doc.path !== 'string' || !doc.path) return []
          return [
            {
              path: doc.path,
              page: typeof doc.page === 'number' ? doc.page : null,
              from: typeof doc.from === 'number' ? doc.from : null,
              to: typeof doc.to === 'number' ? doc.to : null,
            },
          ]
        })
      : []
    return [{ module: row.module, selected: row.selected === true, documents }]
  })
  return rows.length ? JSON.stringify(rows) : ''
}

/**
 * Whether two filter choices say the same thing.
 *
 * Key by key, because the host builds a new record on every context whatever
 * happens — see `same` below, which exists for the same reason and about the
 * same failure.
 */
function agrees(a: FilterChoice, b: FilterChoice): boolean {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) => a[key] === b[key])
}

/** Whether two passages say the same thing. Field by field, because the object is rebuilt every context. */
function same(a: Passage | null, b: Passage | null): boolean {
  if (a === null || b === null) return a === b
  return a.path === b.path && a.page === b.page && a.from === b.from && a.to === b.to && a.quoted === b.quoted
}
