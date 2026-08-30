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
  /**
   * One read of one file's annotations, applied whole.
   *
   * A whole file rather than one annotation, because the interesting half of
   * this operation is what is NOT in the list: an annotation the author has
   * removed can only be recognised by reading everything that is there and
   * noticing what is missing. An op per annotation could add and update and
   * could never mark anything gone.
   *
   * `by` is the byline the derived notes carry. `viaMcp` is not offered: a note
   * lifted out of a file did not come through either door, and saying it came
   * through the agent's one because an agent happened to trigger the read would
   * be exactly the false claim `viaMcp` exists to prevent.
   */
  | {
      op: 'ingest'
      project: string | null
      projectPath: string | null
      path: string
      by: string
      found: {
        key: string
        kind: 'todo' | 'comment'
        body: string
        from: number
        to: number
        quoted: string
      }[]
    }

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

  /* Handled before `viaMcp` is read, because an ingestion has no door — see the
     comment on the op. Reading a field that is not on the variant would be a
     type error, which is the check doing its job. */
  if (op.op === 'ingest') return ingest(store, op, by)

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

/**
 * One file's annotations, reconciled against what is already stored.
 *
 * ## Idempotency is the whole problem, and the key is the whole answer
 *
 * The program this module descends from solved this and left the reasoning in
 * its schema, against a `source_key TEXT UNIQUE` column: "stable across edits
 * (it hashes the note's text, not its offset) so re-opening a chapter
 * re-anchors them instead of duplicating." That is exactly right and it is what
 * happens here. The key is derived from the annotation's WORDS, so reading a
 * chapter twice produces one note; a `\todo{}` that has moved down the file
 * because a paragraph was added above it is recognised as the note it already
 * was, and its offsets are corrected rather than a second note appearing beside
 * it.
 *
 * It is the same instinct as `anchor.ts`, one step earlier: that file compares
 * the quoted words against the file to decide whether an anchor has rotted;
 * this one compares the words against the store to decide whether a note
 * already exists.
 *
 * ## Three things this refuses to do, each of them the obvious shortcut
 *
 * **It never deletes.** An annotation that is no longer in the file is marked
 * `present: false` and left where it is, with its replies and its resolution.
 * A note that disappeared because somebody edited a file is the failure this
 * module's whole design refuses, and it is worse here than anywhere: the most
 * likely reason a `\todo{}` left the source is that the author DID it, and the
 * conversation about how is precisely what somebody will want next month.
 *
 * **It never overwrites what a person wrote.** A derived note's `body` is
 * written once, when the note is created, and never again. Replies, resolution
 * and re-anchoring are the person's and are untouched. Ingestion may only
 * correct the two things it is the authority on — where the annotation now sits
 * in the file, and whether it is still there.
 *
 * **It never un-resolves.** Somebody marking a derived note dealt with is a
 * judgement about the note, not a report about the file, and re-reading the
 * file has nothing to say about it. A `\todo{}` still in the source is not
 * evidence that the person was wrong.
 *
 * ## So what happens when the author EDITS an annotation?
 *
 * It forks, and that is a decision rather than a consequence. Changed words are
 * a changed key, so the new wording arrives as a new note and the old one is
 * marked no longer present — carrying the replies that were about the words it
 * actually said.
 *
 * The alternative — recognising it as the same note and replacing its body —
 * was rejected because of what it does to a thread. Somebody answers
 * `\todo{cite Lamport here}` with "no, this is Fischer"; the author rewrites
 * the macro to say something else; and the reply is now attached to a note it
 * does not answer, silently, with nothing anywhere recording what it used to
 * say. A fork loses nothing and admits what happened. The cost is honest and
 * small: a heavily reworded annotation appears twice, once marked gone, which
 * is a true account of the file's history rather than a tidy one.
 */
function ingest(store: Store, op: Extract<Op, { op: 'ingest' }>, by: string): Outcome {
  const path = str(op.path, MAX_PATH)
  if (!path) return { ok: false, error: 'An ingestion has to name the file it read. Nothing was stored.' }

  const key = projectKey(op)
  const mine = store.notes.filter((one) => projectKey(one) === key && one.path === path && one.source)
  const byKey = new Map(mine.map((one) => [one.source!.key, one]))
  const stamp = now()

  let added = 0
  let moved = 0
  let revived = 0
  const seen = new Set<string>()

  for (const found of op.found) {
    const sourceKey = str(found.key, MAX_PATH)
    const body = str(found.body, MAX_BODY)
    const quoted = str(found.quoted, MAX_QUOTE)
    /* An annotation with no words is not an annotation, and one whose source
       slice will not fit the quote bound cannot be re-anchored later — see the
       essay on `MAX_QUOTE`. Both are skipped rather than stored half-formed. */
    if (!sourceKey || !body || !quoted) continue
    seen.add(sourceKey)

    const already = byKey.get(sourceKey)
    if (already) {
      /* Only the two things ingestion is the authority on. The body, the
         replies, the resolution and the byline are somebody else's. */
      if (already.from !== found.from || already.to !== found.to || already.quoted !== quoted) moved++
      /* An annotation that had gone and has come back — the author reverted an
         edit, or restored a file from a copy. Counted, because the decision to
         write is made from these counters and a revival that changed nothing
         else would otherwise be computed and then dropped on the floor: the
         note would stay marked GONE FROM SOURCE while sitting in the file, for
         as long as nothing else about it changed. Found by a test rather than
         by reading, which is the usual way with a condition that is the
         conjunction of two rare things. */
      if (already.source && !already.source.present) revived++
      already.from = found.from
      already.to = found.to
      already.quoted = quoted
      already.fingerprint = fingerprint(quoted)
      already.source = { key: sourceKey, kind: found.kind, present: true, seenAt: stamp, goneAt: null }
      continue
    }

    store.notes.push({
      id: mint('n'),
      project: str(op.project, 120) || null,
      projectPath: str(op.projectPath, MAX_PATH) || null,
      path,
      /* No page. A page is a property of a READER — how one module chose to
         paginate a document — and this read the file. Inventing one would put a
         filter on a note that the file never said anything about, and `null` is
         already how a note about the whole document is spelled. */
      page: null,
      from: found.from,
      to: found.to,
      quoted,
      fingerprint: fingerprint(quoted),
      body,
      by,
      /* Not through the MCP door, whoever asked for the read. See `Op`. */
      viaMcp: false,
      at: stamp,
      resolved: false,
      resolvedAt: null,
      resolvedBy: null,
      replies: [],
      source: { key: sourceKey, kind: found.kind, present: true, seenAt: stamp, goneAt: null },
    })
    added++
  }

  let gone = 0
  for (const note of mine) {
    const source = note.source
    if (!source || seen.has(source.key)) continue
    /* Marked once. A note already known to be gone keeps the date it went,
       because "when did this stop being in the file" is the useful fact and
       re-stamping it on every read would turn it into "when was this file last
       read", which is already `seenAt` on everything else. */
    if (!source.present) continue
    note.source = { ...source, present: false, goneAt: stamp }
    gone++
  }

  if (added || gone || moved || revived) write(store)
  return {
    ok: true,
    said:
      `Read ${op.found.length} in ${path}: ${added} new, ${moved} re-anchored, ${gone} no longer in the source`
      + `${revived ? `, ${revived} back in it` : ''}.`,
    id: '',
  }
}
