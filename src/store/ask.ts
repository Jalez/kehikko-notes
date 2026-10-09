import { ask, type AskFailure } from 'kehikot-module-protocol/client'

import type { Anchored } from '../../notes/anchor.ts'
import type { Scope } from '../../notes/scope.ts'

/**
 * Talking to this app's own server, which is the same origin this page came
 * from.
 *
 * ## Why these are plain relative fetches and it is worth saying so
 *
 * `/api/notes` and `/api/note` are relative paths, so the browser resolves them
 * against the document — which is `http://127.0.0.1:7940/app`, framed or not,
 * because this module declares `storage: true` and therefore keeps its origin.
 * Every request below is an ordinary same-origin request: no preflight, no CORS
 * header offered to anybody, and no way for a page in another tab to make one
 * of them. The essay in `manifest.ts` is why that was worth the declaration.
 *
 * They go through the protocol's `ask`, which carries the page's write ticket in
 * `x-module-ticket`, never throws, and turns every failure into one of three
 * kinds with a sentence: the server said no (`refused`, its own words), nothing
 * answered (`down`), or this page is older than its server (`stale` — the page
 * reloads itself a moment later). `down` and `stale` are drawn by the shared
 * cover in `app.tsx`, so `kind` rides along with every failure here.
 *
 * ## The types come from the server's own files, AS TYPES
 *
 * `Anchored` and `Scope` are imported from `notes/` above the `src/` boundary
 * and are erased at build. That is deliberate rather than lazy: these shapes are
 * decided in one place and drawn in another, and a hand-written copy on this
 * side would be a second definition that silently disagrees the first time a row
 * grows a field.
 *
 * `import type` and not a value import, and that is load-bearing rather than
 * tidy. `notes/anchor.ts` is pure and would be safe either way, but
 * `notes/scope.ts`'s neighbours are not: `notes/keep.ts` imports `node:fs` and
 * `notes/source.ts` imports three node modules, and one value import that
 * reaches them drags `node:fs` into the browser bundle. `tsc` would say nothing,
 * `bun test` would say nothing, and the only symptom would be a page that loads
 * and never answers the host's greeting — because the bundle threw before React
 * ran. The pure helpers this page genuinely needs at runtime are imported as
 * VALUES from `notes/scope.ts` and `notes/shape.ts`, both of which touch no node
 * module at all; the rule is per file, and those two files are kept that way on
 * purpose.
 */

export type { Anchored, Scope }

/**
 * What one screen is about: the project, and where the reader is pointing.
 *
 * `projectPath` is not nullable here any more, and that is the change worth
 * naming. It used to be, because the store partitioned on a pair of nullable
 * fields and a null pair was a real question — the pile of notes nobody had
 * attributed to a project. There is no such pile now: notes live at
 * `<projectPath>/.kehikot/notes/notes.json`, so with no path there is no file, no
 * question, and nothing this app could honestly answer.
 *
 * So the page does not build an `Ask` at all until it has one, and draws
 * `NoProject` instead. Requiring it in the TYPE is what makes that impossible
 * to forget: a screen that sent `projectPath: null` would be asking the door a
 * question it is right to refuse, and the refusal would arrive as red text on a
 * canvas where nothing at all is wrong.
 */
export interface Ask {
  /**
   * What the project is CALLED, for the sentence on screen.
   *
   * Never sent to the door and never stored — a name cannot address a file, and
   * the door partitions by nothing at all now. It is here because a person
   * reading "every note in this project" wants the project's name in it, and
   * `context.project` is where a host says what that is.
   */
  project: string | null
  projectPath: string
  path: string | null
  page: number | null
  from: number | null
  to: number | null
  /** Everything in the project, because somebody pressed for it. Not a rung on the ladder. */
  everything: boolean
  resolved: boolean
}

export interface Looked {
  said: string
  scope: Scope
  shown: Anchored[]
  adrift: Anchored[]
  elsewhere: number
  /** Notes this app lifted under a rule it no longer applies. See `Source.withdrawn`. */
  withdrawn: Anchored[]
  /** Whether this app was able to open any of these documents to check an anchor. */
  verified: boolean
  /** Whether the document asked about could be opened at all; null when none was named. See `doors.ts`. */
  opened: boolean | null
  trouble: string | null
}

function query(asked: Ask): Record<string, string | number | null> {
  /* `project` is deliberately not sent: the server reads the folder, not the name. Empty values
     are dropped, which `ask` does for `null` and this does for `''`. */
  const put = (value: string | number | null) => (value === '' ? null : value)
  return {
    projectPath: put(asked.projectPath),
    ...(asked.everything
      ? { everything: 1 }
      : { path: put(asked.path), page: asked.page, from: asked.from, to: asked.to }),
    ...(asked.resolved ? { resolved: 1 } : {}),
  }
}

/** A failure of either door: the sentence, and which of the three kinds it was. */
export interface Failed {
  error: string
  kind: AskFailure
}

/**
 * One screen's worth of notes.
 *
 * Refused rather than empty when the ask was not a question — the server says so
 * in a sentence, and this hands the sentence on. "Nobody has written anything
 * here" and "that was not a scope" are two different answers with two different
 * remedies, and this is a module whose whole argument is that those do not get
 * flattened.
 */
export async function look(wanted: Ask): Promise<Looked | Failed> {
  const asked = await ask<Partial<Looked>>('/api/notes', { query: query(wanted) })
  if (!asked.ok) return { error: asked.error, kind: asked.kind }
  const body = asked.body ?? {}
  return {
    said: typeof body.said === 'string' ? body.said : '',
    scope: body.scope as Scope,
    shown: Array.isArray(body.shown) ? body.shown : [],
    adrift: Array.isArray(body.adrift) ? body.adrift : [],
    elsewhere: typeof body.elsewhere === 'number' ? body.elsewhere : 0,
    withdrawn: Array.isArray(body.withdrawn) ? body.withdrawn : [],
    verified: body.verified === true,
    opened: typeof body.opened === 'boolean' ? body.opened : null,
    trouble: typeof body.trouble === 'string' ? body.trouble : null,
  }
}

/**
 * One change, and every one of them says which project it is against.
 *
 * `projectPath` is on the outside of the union rather than on the `add` variant,
 * because it is not part of what is being written — it is which STORE is being
 * written to, and that is true of a reply and a resolution exactly as much as of
 * a new note. A note id addresses a note inside one project's file and means
 * nothing without it.
 *
 * Sent on every press rather than remembered by the door, because a reader can
 * move to another project between the read that drew a row and the press on it.
 * The request that carries the press is the only thing that knows where the page
 * was standing when it happened.
 */
export type Change =
  | {
      op: 'add'
      path: string
      page: number | null
      from: number | null
      to: number | null
      quoted: string
      body: string
    }
  | { op: 'reply'; id: string; body: string }
  | { op: 'resolve'; id: string; done: boolean }
  | { op: 'reanchor'; id: string; from: number; to: number; quoted: string }
  /** The words rewritten by the person looking at them. Typed notes only; the door says why. */
  | { op: 'edit'; id: string; body: string }
  /** Gone for good, replies and all. Typed notes only, and behind two presses — see `Arm`. */
  | { op: 'remove'; id: string }

/**
 * A change, and the project it is against.
 *
 * Two types rather than one because the page and the door hold different halves.
 * A component knows WHAT it is doing — reply to this note, resolve that one —
 * and has no business knowing where the store is; `App` knows where the page is
 * standing and adds it on the way out. Splitting them is what lets the `write`
 * callback take a `Change` and be impossible to call with a stale project.
 */
export type Edit = Change & { projectPath: string }

export type Answer = { ok: true; said: string; id: string } | ({ ok: false } & Failed)

/**
 * Every change the owner makes, through the one door the server decides at.
 *
 * The page does not update itself from what it sent; it re-reads. The server
 * holds the notes and resolves every anchor against the file on disk, and a
 * page that inserted its own new row optimistically would be drawing a row with
 * no anchor verdict on it — which is the one thing every row here is for.
 */
export async function edit(change: Edit): Promise<Answer> {
  const asked = await ask<{ said?: unknown; id?: unknown }>('/api/note', { body: change })
  if (!asked.ok) return { ok: false, error: asked.error, kind: asked.kind }
  return {
    ok: true,
    said: typeof asked.body?.said === 'string' ? asked.body.said : '',
    id: typeof asked.body?.id === 'string' ? asked.body.id : '',
  }
}
