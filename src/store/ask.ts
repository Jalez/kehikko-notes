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

/**
 * The ticket, read once off the inert JSON island the document carries.
 *
 * Read at module load rather than per request, because it cannot change while
 * this document is open: it is minted per server process and printed into the
 * page. A missing island is an empty string rather than a throw — that is a
 * page served by something other than this app's own server, and the writes
 * will be refused with a sentence rather than the page failing to render.
 */
function ticket(): string {
  const island = typeof document === 'undefined' ? null : document.getElementById('ticket')
  if (!island?.textContent) return ''
  try {
    const parsed: unknown = JSON.parse(island.textContent)
    return typeof parsed === 'string' ? parsed : ''
  } catch {
    return ''
  }
}

const TICKET = ticket()

export type { Anchored, Scope }

/** What one screen is about: the project, and where the reader is pointing. */
export interface Ask {
  project: string | null
  projectPath: string | null
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
  /** Whether this app was able to open any of these documents to check an anchor. */
  verified: boolean
  trouble: string | null
}

function query(ask: Ask): string {
  const parts: string[] = []
  const put = (key: string, value: string | number | null) => {
    if (value === null || value === '') return
    parts.push(`${key}=${encodeURIComponent(String(value))}`)
  }
  put('project', ask.project)
  put('projectPath', ask.projectPath)
  if (ask.everything) parts.push('everything=1')
  else {
    put('path', ask.path)
    put('page', ask.page)
    put('from', ask.from)
    put('to', ask.to)
  }
  if (ask.resolved) parts.push('resolved=1')
  return parts.join('&')
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
export async function look(ask: Ask): Promise<Looked | { error: string }> {
  const response = await fetch(`/api/notes?${query(ask)}`)
  const body = (await response.json()) as Partial<Looked> & { ok?: unknown; error?: unknown }
  if (body.ok === true) {
    return {
      said: typeof body.said === 'string' ? body.said : '',
      scope: body.scope as Scope,
      shown: Array.isArray(body.shown) ? body.shown : [],
      adrift: Array.isArray(body.adrift) ? body.adrift : [],
      elsewhere: typeof body.elsewhere === 'number' ? body.elsewhere : 0,
      verified: body.verified === true,
      trouble: typeof body.trouble === 'string' ? body.trouble : null,
    }
  }
  return { error: typeof body.error === 'string' ? body.error : 'this app could not read its notes.' }
}

export type Edit =
  | {
      op: 'add'
      project: string | null
      projectPath: string | null
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

export type Answer = { ok: true; said: string; id: string } | { ok: false; error: string }

/**
 * Every change the owner makes, through the one door the server decides at.
 *
 * The page does not update itself from what it sent; it re-reads. The server
 * holds the notes and resolves every anchor against the file on disk, and a
 * page that inserted its own new row optimistically would be drawing a row with
 * no anchor verdict on it — which is the one thing every row here is for.
 */
export async function edit(change: Edit): Promise<Answer> {
  const response = await fetch('/api/note', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-notes-ticket': TICKET },
    body: JSON.stringify(change),
  })
  const body = (await response.json()) as { ok?: unknown; said?: unknown; id?: unknown; error?: unknown }
  if (body.ok === true) {
    return {
      ok: true,
      said: typeof body.said === 'string' ? body.said : '',
      id: typeof body.id === 'string' ? body.id : '',
    }
  }
  return {
    ok: false,
    error: typeof body.error === 'string' ? body.error : 'it did not work, and said nothing about why',
  }
}
