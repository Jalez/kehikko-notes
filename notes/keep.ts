import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { dataDir } from '../store.ts'
import {
  MAX_BODY,
  MAX_BY,
  MAX_PATH,
  MAX_QUOTE,
  MAX_REPLIES,
  fingerprint,
  projectKey,
  type Note,
  type Reply,
  type Store,
} from './shape.ts'

/**
 * The one file, and every change that may be made to it.
 *
 * ## One function decides, and both doors call it
 *
 * `change()` is the only way anything in this program alters a note. The page
 * posts to `/api/note` and an agent calls a tool, and both arrive here with the
 * same arguments and are refused with the same sentence. Two decision sites is
 * how a page and an agent end up believing different things about the same
 * store, and this module's whole claim is about not doing that.
 *
 * Every refusal is a SENTENCE and never a code. Whoever is reading it is either
 * a person looking at a pane or an agent that has to decide what to do next,
 * and both of them need to be told what to do instead.
 */

function file(): string {
  return join(dataDir(), 'notes.json')
}

const EMPTY: Store = { version: 1, notes: [] }

/**
 * Everything on disk, or an empty store and a sentence about why.
 *
 * An absent file is NOT trouble: it is a first run, and reporting it as an
 * error would make every fresh install look broken. A file that is there and
 * cannot be parsed IS trouble, and is reported rather than silently replaced —
 * overwriting somebody's notes because a byte got mangled is the one
 * irreversible thing this program could do.
 */
export function read(): { store: Store; trouble: string | null } {
  let raw: string
  try {
    raw = readFileSync(file(), 'utf8')
  } catch {
    return { store: { ...EMPTY, notes: [] }, trouble: null }
  }
  try {
    const parsed = JSON.parse(raw) as Partial<Store>
    if (!parsed || !Array.isArray(parsed.notes)) throw new Error('no notes array')
    return { store: { version: 1, notes: parsed.notes as Note[] }, trouble: null }
  } catch {
    return {
      store: { ...EMPTY, notes: [] },
      trouble:
        `This app could not read its own store at ${file()}. Nothing has been changed and nothing has been thrown `
        + 'away — the file is still there. Until it parses, this pane will show no notes and refuse to write any, '
        + 'because writing would replace whatever is in it.',
    }
  }
}

/**
 * Everything on disk, written the only way that survives a crash mid-write.
 *
 * To a neighbouring file and then renamed, because `rename` within a directory
 * is atomic on every filesystem this runs on and a truncated `notes.json` is
 * every note somebody wrote. A partial write here is not a corrupted row; it is
 * the store.
 */
function write(store: Store): void {
  const target = file()
  const temporary = `${target}.writing`
  writeFileSync(temporary, `${JSON.stringify(store, null, 2)}\n`)
  renameSync(temporary, target)
}

/**
 * A short id for a note or a reply.
 *
 * Time first so that ids sort into the order they were made, which makes a
 * store readable by a person opening the JSON — and a random tail so two writes
 * in the same millisecond cannot collide. Not a UUID: these are printed on the
 * page and quoted by agents at the door, and thirty-six characters of hex is a
 * thing people mistype.
 */
function mint(prefix: string): string {
  const stamp = Date.now().toString(36)
  const tail = Math.floor(Math.random() * 0x1000000)
    .toString(36)
    .padStart(4, '0')
  return `${prefix}${stamp}${tail}`
}

function now(): string {
  return new Date().toISOString()
}

/** Trimmed and bounded before it is looked at. A string has a length before it has a meaning. */
export function str(value: unknown, max: number): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value).slice(0, max)
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

/** A whole number, or null. Refused rather than defaulted; see `Op.page`. */
export function count(value: unknown): number | null {
  const raw = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
  return Number.isFinite(raw) ? Math.trunc(raw) : null
}

export type Op =
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
      by: string
      viaMcp?: boolean
    }
  | { op: 'reply'; id: string; body: string; by: string; viaMcp?: boolean }
  | { op: 'resolve'; id: string; done: boolean; by: string; viaMcp?: boolean }
  | { op: 'reanchor'; id: string; from: number; to: number; quoted: string; by: string; viaMcp?: boolean }

export type Outcome = { ok: true; said: string; id: string } | { ok: false; error: string }

/**
 * Every change, decided in one place.
 *
 * The store is re-read on every call rather than held in memory. Two doors and
 * a page write here, a person may edit the JSON by hand, and a cached copy is
 * how a note written over MCP disappears the next time somebody presses
 * something on the page.
 */
export function change(op: Op): Outcome {
  const { store, trouble } = read()
  if (trouble) return { ok: false, error: trouble }

  const by = str(op.by, MAX_BY) || 'somebody'
  const viaMcp = op.viaMcp === true

  if (op.op === 'add') {
    const path = str(op.path, MAX_PATH)
    if (!path) {
      return {
        ok: false,
        error:
          'A note has to be about somewhere. Give the document it is about — the path the paper module names, as it '
          + 'names it. A note with no anchor is a thought with nowhere to go back to.',
      }
    }
    const body = str(op.body, MAX_BODY)
    if (!body) {
      return { ok: false, error: 'A note has to say something. Nothing was written, so nothing was stored.' }
    }

    const hasFrom = op.from !== null && op.from !== undefined
    const hasTo = op.to !== null && op.to !== undefined
    if (hasFrom !== hasTo) {
      return {
        ok: false,
        error:
          'A note names both ends of the passage it is about or neither. Half a range is not a vaguer note — it is '
          + 'one whose missing end this app would have to invent, and the end it invented would be a claim about '
          + 'somebody else’s document. Omit both to write a note about the page.',
      }
    }
    if (hasFrom && (op.from as number) < 0) {
      return { ok: false, error: 'A passage starts at or after byte 0. Nothing was stored.' }
    }
    if (hasFrom && (op.to as number) <= (op.from as number)) {
      return { ok: false, error: 'A passage ends after it starts. Nothing was stored.' }
    }

    const quoted = str(op.quoted, MAX_QUOTE)
    if (hasFrom && !quoted) {
      return {
        ok: false,
        error:
          'A note about a passage has to quote it. Byte offsets rot the moment anybody edits the document above '
          + 'them, and the words are the only thing that can later tell a good anchor from one pointing at the wrong '
          + 'sentence — which is the failure this whole module is built to make visible. Send the text that was '
          + 'selected.',
      }
    }

    const page = op.page === null || op.page === undefined ? null : op.page
    if (page !== null && (!Number.isFinite(page) || page < 1)) {
      return { ok: false, error: 'A page counts from 1, or is left out entirely. Nothing was stored.' }
    }

    const note: Note = {
      id: mint('n'),
      project: str(op.project, 120) || null,
      projectPath: str(op.projectPath, MAX_PATH) || null,
      path,
      page,
      from: hasFrom ? (op.from as number) : null,
      to: hasFrom ? (op.to as number) : null,
      quoted,
      fingerprint: fingerprint(quoted),
      body,
      by,
      viaMcp,
      at: now(),
      resolved: false,
      resolvedAt: null,
      resolvedBy: null,
      replies: [],
    }
    store.notes.push(note)
    write(store)
    const where = note.from === null ? (page === null ? path : `page ${page} of ${path}`) : `${path} bytes ${note.from}–${note.to}`
    return { ok: true, said: `Noted against ${where}`, id: note.id }
  }

  const note = store.notes.find((one) => one.id === op.id)
  if (!note) {
    return {
      ok: false,
      error:
        `There is no note "${str(op.id, 60)}" here. Notes are addressed by the id printed beside each one; ask for `
        + 'the notes on a document to see them.',
    }
  }

  if (op.op === 'reply') {
    const body = str(op.body, MAX_BODY)
    if (!body) return { ok: false, error: 'A reply has to say something. Nothing was written, so nothing was stored.' }
    if (note.replies.length >= MAX_REPLIES) {
      return {
        ok: false,
        error:
          `This note already carries ${MAX_REPLIES} replies, which is far past the point where a thread belongs `
          + 'somewhere it can be searched. Resolve it and write a new note about what is actually still open.',
      }
    }
    const reply: Reply = { id: mint('r'), body, by, viaMcp, at: now() }
    note.replies.push(reply)
    write(store)
    return { ok: true, said: `Replied to ${note.id}`, id: note.id }
  }

  if (op.op === 'resolve') {
    if (note.resolved === op.done) {
      return {
        ok: false,
        error: op.done
          ? `Note ${note.id} was already resolved, by ${note.resolvedBy ?? 'somebody'}. Nothing was changed.`
          : `Note ${note.id} is already open. Nothing was changed.`,
      }
    }
    note.resolved = op.done
    note.resolvedAt = op.done ? now() : null
    note.resolvedBy = op.done ? by : null
    write(store)
    return { ok: true, said: op.done ? `Resolved ${note.id}` : `Reopened ${note.id}`, id: note.id }
  }

  /* Re-anchoring: the one write that changes what a note is ABOUT. */
  if (note.from === null) {
    return {
      ok: false,
      error:
        `Note ${note.id} was written about a page rather than a passage, so it has no range to move. Re-anchoring `
        + 'only applies to a note whose offsets have drifted.',
    }
  }
  if (op.to <= op.from || op.from < 0) {
    return { ok: false, error: 'A passage ends after it starts and begins at or after byte 0. Nothing was moved.' }
  }
  const quoted = str(op.quoted, MAX_QUOTE)
  if (!quoted) {
    return {
      ok: false,
      error:
        'Re-anchoring has to say what is at the new place, in its own words. An anchor moved without them is a note '
        + 'this app can no longer check, which is the state re-anchoring exists to get out of.',
    }
  }
  note.from = op.from
  note.to = op.to
  note.quoted = quoted
  note.fingerprint = fingerprint(quoted)
  write(store)
  return { ok: true, said: `Re-anchored ${note.id} to bytes ${op.from}–${op.to}`, id: note.id }
}

/**
 * The notes belonging to one project.
 *
 * Partitioned here rather than at every caller, because "notes are the
 * project's" is a rule and not a convenience: notes on one project's thesis
 * appearing beside another's is the failure this exists to prevent, and a rule
 * enforced at four call sites is a rule with four chances to be forgotten.
 *
 * The key is `projectKey` — the path where there is one, the name otherwise,
 * and `''` for a note nobody ever said a project about. Those last ones are
 * their own pile: merging them into whichever project happens to be open would
 * be this app inventing a fact about somebody's material.
 */
export function notesOf(project: { project?: string | null; projectPath?: string | null }): {
  notes: Note[]
  trouble: string | null
} {
  const { store, trouble } = read()
  const key = projectKey(project)
  return { notes: store.notes.filter((one) => projectKey(one) === key), trouble }
}

/** How many notes there are in total, for the health check. */
export function howMany(): { total: number; trouble: string | null } {
  const { store, trouble } = read()
  return { total: store.notes.length, trouble }
}
