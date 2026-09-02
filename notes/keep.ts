import { readFileSync, renameSync, writeFileSync } from 'node:fs'

import { dataFile, makeDir } from '../store.ts'
import { climbs, resolved, rootsOf, stored } from './where.ts'
import {
  MAX_BODY,
  MAX_BY,
  MAX_PATH,
  MAX_QUOTE,
  MAX_REPLIES,
  fingerprint,
  sourceOf,
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
 * a person looking at a container or an agent that has to decide what to do next,
 * and both of them need to be told what to do instead.
 *
 * ## Every function here takes the project, and that REPLACED a filter
 *
 * There used to be one file holding every project's notes and a `notesOf()`
 * that filtered it by a key computed from two fields on each note. It is gone.
 * The project is now the FILE — `<projectPath>/.kehikot/notes/notes.json`, see
 * `store.ts` — so which project a caller means is a parameter to OPENING the
 * store rather than a predicate applied after opening it.
 *
 * That is a smaller program and a stronger rule. A filter is a rule with a
 * fresh chance of being forgotten at every new call site; there were four here.
 * A file's location has none.
 *
 * The parameter is nullable, and that is not laziness. `projectPath` is
 * nullable on the wire, so "there is no project" is a state this module has to
 * be able to be in and answer honestly: a read comes back empty with `nowhere`
 * set, and every write is refused with a sentence. What it must never do is
 * pick a default, because a default here writes somebody's notes into a folder
 * they will never open.
 */

const EMPTY: Store = { version: 1, notes: [] }

export interface Read {
  store: Store
  /** Why nothing can be read or written, when a project WAS named and refused. */
  trouble: string | null
  /**
   * Whether nobody said which project this is.
   *
   * A separate field from `trouble` because it is a different sentence.
   * `trouble` means "this was asked for and refused" and belongs on screen in
   * red; `nowhere` means nobody asked yet, which is an ordinary state on a
   * canvas that has not opened a project.
   *
   * Collapsing them fails both ways. As trouble, it tells a reader their canvas
   * is broken when it is merely somewhere else. As a plain empty store, it
   * invites a write — and a write with no project is either refused or lands in
   * a guessed folder, which is the one thing `store.ts` spends its length
   * refusing to do.
   */
  nowhere: boolean
}

/**
 * Everything in ONE PROJECT's store, or an empty one and a sentence about why.
 *
 * An absent file is NOT trouble: it is a project nobody has written a note
 * about yet, and reporting it as an error would make every new project look
 * broken. A file that is there and cannot be parsed IS trouble, and is reported
 * rather than silently replaced — overwriting somebody's notes because a byte
 * got mangled is the one irreversible thing this program could do.
 */
export function read(projectPath: string | null | undefined): Read {
  const { path, trouble } = dataFile(projectPath)
  if (trouble) return { store: { ...EMPTY, notes: [] }, trouble, nowhere: false }
  if (path === null) return { store: { ...EMPTY, notes: [] }, trouble: null, nowhere: true }

  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return { store: { ...EMPTY, notes: [] }, trouble: null, nowhere: false }
  }
  try {
    const parsed = JSON.parse(raw) as Partial<Store>
    if (!parsed || !Array.isArray(parsed.notes)) throw new Error('no notes array')
    /*
     * The migration, and it is here because a migration that has to be RUN is a
     * migration nobody runs.
     *
     * A note's path is stored relative to the project — see `notes/where.ts`
     * for why, and for what happens to each shape a stored path can have. All
     * four cases are decided by `resolved()` and none of them can lose a note:
     * a relative path is joined onto the project, an absolute one written
     * before this change is handed back as it stands and quietly becomes
     * relative the next time anything writes, and one that climbs out of the
     * project is left exactly as somebody typed it. Whether the document can be
     * OPENED is a different question, asked later, by `notes/source.ts`.
     *
     * A copy rather than a mutation of the parsed object, so that the shape
     * handed to callers is one thing and the file is another. `write()` does
     * the same in reverse and they are the only two places that know.
     */
    const roots = rootsOf(projectPath)
    const notes = (parsed.notes as Note[]).map((note) =>
      typeof note?.path === 'string' ? { ...note, path: resolved(roots, note.path) } : note,
    )
    return { store: { version: 1, notes }, trouble: null, nowhere: false }
  } catch {
    return {
      store: { ...EMPTY, notes: [] },
      trouble:
        `This app could not read its own store at ${path}. Nothing has been changed and nothing has been thrown `
        + 'away — the file is still there. Until it parses, this container will show no notes and refuse to write any, '
        + 'because writing would replace whatever is in it.',
      nowhere: false,
    }
  }
}

/**
 * One project's store, written the only way that survives a crash mid-write.
 *
 * To a neighbouring file and then renamed, because `rename` within a directory
 * is atomic on every filesystem this runs on and a truncated `notes.json` is
 * every note somebody wrote. A partial write here is not a corrupted row; it is
 * the store.
 *
 * `makeDir` goes first, and it is where the folder comes into existence and the
 * project's `.gitignore` is told about it — on this path and never on the read
 * path, so that looking at a repository does not change it. Its refusal is also
 * the fence: it resolves the folder AFTER creating it and will not hand back one
 * that turns out to point outside the project.
 *
 * A sentence comes back rather than an exception, because every caller of this
 * already has to produce one for whoever pressed something.
 */
function write(projectPath: string | null | undefined, store: Store): string | null {
  const made = makeDir(projectPath)
  if (made.trouble) return made.trouble
  if (made.dir === null) return NOWHERE

  const { path, trouble } = dataFile(projectPath)
  if (trouble) return trouble
  if (path === null) return NOWHERE

  /* The other half of the boundary. Everything above this line holds absolute
     paths; the file holds paths relative to the project. Written from a copy so
     that the notes the caller is still holding keep the spelling they were
     handed — a `change()` that returned notes whose paths had turned relative
     underneath it would be the one bug this arrangement exists to avoid. */
  const roots = rootsOf(projectPath)
  const onDisk: Store = {
    version: store.version,
    notes: store.notes.map((note) =>
      typeof note?.path === 'string' ? { ...note, path: stored(roots, note.path) } : note,
    ),
  }

  const temporary = `${path}.writing`
  writeFileSync(temporary, `${JSON.stringify(onDisk, null, 2)}\n`)
  renameSync(temporary, path)
  return null
}

/**
 * What a write is refused with when nothing has said which project this is.
 *
 * One sentence in one place, because it is the answer at the page's door and at
 * the agent's, and two spellings of it is how a person and an agent end up
 * describing different situations to each other. Like every refusal here it
 * names the remedy rather than stopping at "no".
 */
export const NOWHERE =
  'Nothing has said which project this is, so there is nowhere to write. Notes live inside the project they are '
  + 'about, at <project>/.kehikot/notes/notes.json, and this app will not guess at a folder — a note written into a '
  + 'directory nobody named is a note nobody will ever look in. Open a project on this canvas, or send projectPath.'

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
   * The words of a note, rewritten by the person who is looking at it.
   *
   * Only ever a note somebody TYPED. A note lifted out of the source has its
   * words in the `.tex`, and a body rewritten here would be overwritten by
   * the next read of that file — or, worse, would sit beside the annotation
   * saying something the annotation does not, with nothing on the row able to
   * say which is the record. The honest edit for those is in the document.
   *
   * Never offered at the MCP door. An agent changing what a person wrote is
   * the reply door's reason for existing: a reply is attributed, an edit is
   * not.
   */
  | { op: 'edit'; id: string; body: string; by: string }
  /**
   * The one irreversible act in this store, and the argument for it being here
   * at all is narrower than it looks.
   *
   * `doors.ts` has said for the life of this module that there is no
   * `forget_note`: deleting a note removes the reason a sentence was changed
   * along with the note, and `resolve_note` is what "dealt with" means. That
   * stands, and it is about an AGENT — "an agent that wants a note gone can say
   * so and be told no by somebody". This is the somebody. A person at the page
   * who typed a note into the wrong place a minute ago, or a note with a typo
   * they would rather not resolve than keep, has a record that is theirs and
   * nobody's conversation yet. It goes, with its replies, and the press that
   * does it says so twice — see `Arm` in `src/view/arm.tsx`.
   *
   * Refused for a note lifted out of the source, and for the same reason
   * `edit` is: the annotation is still in the `.tex`, the next read of the
   * file would lift it again, and a delete that quietly comes back is worse
   * than none. Those are resolved here or removed in the document.
   */
  | { op: 'remove'; id: string; by: string }
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
      path: string
      by: string
      found: Annotated[]
      /**
       * What the same read found and deliberately did not lift.
       *
       * The preamble, today, and whatever this app next decides is build rather
       * than annotation. It is sent because ingestion is the only thing that can
       * reconcile it: a note lifted under the old rules is already in the store,
       * nothing here deletes, and the store has to be told by the same reading
       * that stopped lifting it — otherwise the note sits there claiming to be
       * an annotation about the paper with nothing anywhere able to say
       * otherwise.
       *
       * It never creates anything. It can only mark what is already here.
       */
      withdrawn?: Annotated[]
    }

/** One annotation, as a read of a file hands it to the store. */
export interface Annotated {
  key: string
  kind: 'todo' | 'comment'
  body: string
  from: number
  to: number
  quoted: string
}

export type Outcome = { ok: true; said: string; id: string } | { ok: false; error: string }

/**
 * Every change, decided in one place.
 *
 * The store is re-read on every call rather than held in memory. Two doors and
 * a page write here, a person may edit the JSON by hand — which is much more
 * likely now that the file sits in their own repository — and a cached copy is
 * how a note written over MCP disappears the next time somebody presses
 * something on the page.
 *
 * `projectPath` is first because it decides WHICH store, before anything decides
 * what to do to it. Null is refused outright, with `NOWHERE`: there is no
 * version of this that guesses a folder.
 */
export function change(projectPath: string | null | undefined, op: Op): Outcome {
  const { store, trouble, nowhere } = read(projectPath)
  if (trouble) return { ok: false, error: trouble }
  if (nowhere) return { ok: false, error: NOWHERE }

  const by = str(op.by, MAX_BY) || 'somebody'

  /* Handled before `viaMcp` is read, because an ingestion has no door — see the
     comment on the op. Reading a field that is not on the variant would be a
     type error, which is the check doing its job. */
  if (op.op === 'ingest') return ingest(projectPath, store, op, by)

  /* `edit` and `remove` have no door for an agent, so the field is not on
     their variants; for every other op it says which door the press came by. */
  const viaMcp = 'viaMcp' in op && op.viaMcp === true

  if (op.op === 'add') {
    const asked = str(op.path, MAX_PATH)
    if (!asked) {
      return {
        ok: false,
        error:
          'A note has to be about somewhere. Give the document it is about — the path the paper module names, as it '
          + 'names it. A note with no anchor is a thought with nowhere to go back to.',
      }
    }
    /*
     * The path, in the one spelling this program uses.
     *
     * Absolute paths keep arriving here and always will: the host's
     * `projectPath` is absolute by design, the passage a module relays is
     * absolute, and every MCP caller sends one. They are taken exactly as
     * before and turned into the project's own spelling of the same file, which
     * is what `write()` will then store relative to the project.
     *
     * A relative path that climbs OUT of the project is the one shape refused,
     * because it names nowhere. `../../etc/passwd` has no meaning except
     * against a root, and the only root it could be joined to is the project it
     * has just left. Refused here, at the door, while there is still somebody
     * to tell — see `climbs` in `notes/where.ts` for why an ABSOLUTE path
     * outside the project is not refused with it.
     */
    const roots = rootsOf(projectPath)
    if (climbs(roots, asked)) {
      return {
        ok: false,
        error:
          `"${asked}" climbs out of the project. A note's document is named either absolutely, or relative to the `
          + 'project it is in — and a relative path with .. in front of it is neither, because the only folder it '
          + 'could be resolved against is the one it just left. Nothing was stored. Send the absolute path of the '
          + 'document, which is what the paper module and the host both name it by.',
      }
    }
    const path = resolved(roots, stored(roots, asked))
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
    const refused = write(projectPath, store)
    if (refused) return { ok: false, error: refused }
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
    const refused = write(projectPath, store)
    if (refused) return { ok: false, error: refused }
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
    const refused = write(projectPath, store)
    if (refused) return { ok: false, error: refused }
    return { ok: true, said: op.done ? `Resolved ${note.id}` : `Reopened ${note.id}`, id: note.id }
  }

  if (op.op === 'edit' || op.op === 'remove') {
    const source = sourceOf(note)
    if (source) {
      const what = op.op === 'edit' ? 'rewritten' : 'removed'
      return {
        ok: false,
        error:
          `Note ${note.id} was lifted out of the document itself, so it cannot be ${what} here: its words are in `
          + `${note.path}, and the next read of that file would ${op.op === 'edit' ? 'put them back' : 'lift it again'}. `
          + `${op.op === 'edit' ? 'Edit the annotation in the document' : 'Resolve it, or take the annotation out of the document'}. Nothing was changed.`,
      }
    }
  }

  if (op.op === 'edit') {
    const body = str(op.body, MAX_BODY)
    if (!body) return { ok: false, error: 'A note has to say something. Nothing was written, so nothing was changed.' }
    if (body === note.body) return { ok: false, error: `Note ${note.id} already says that. Nothing was changed.` }
    note.body = body
    const refused = write(projectPath, store)
    if (refused) return { ok: false, error: refused }
    return { ok: true, said: `Rewrote ${note.id}`, id: note.id }
  }

  if (op.op === 'remove') {
    const replies = note.replies.length
    store.notes = store.notes.filter((one) => one.id !== note.id)
    const refused = write(projectPath, store)
    if (refused) return { ok: false, error: refused }
    return {
      ok: true,
      said: `Removed ${note.id}${replies ? ` and the ${replies === 1 ? 'reply' : `${replies} replies`} on it` : ''}, for good`,
      id: note.id,
    }
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
  const refused = write(projectPath, store)
  if (refused) return { ok: false, error: refused }
  return { ok: true, said: `Re-anchored ${note.id} to bytes ${op.from}–${op.to}`, id: note.id }
}

/**
 * The notes belonging to one project.
 *
 * There is no filter left in this function, and that is the change. It used to
 * open one file holding everybody's notes and keep the ones whose `projectKey`
 * matched; now it opens THAT PROJECT'S file, and everything in it is by
 * definition the answer. "Notes on one project's thesis must not appear beside
 * another's" is the same rule it always was — enforced by which file was opened
 * rather than by a predicate four call sites had to remember to apply.
 *
 * `nowhere` is passed through rather than being flattened into an empty list.
 * A caller has to be able to tell "this project has no notes" from "nobody said
 * which project", because those two sentences send a reader to opposite places.
 */
export function notesOf(projectPath: string | null | undefined): {
  notes: Note[]
  trouble: string | null
  nowhere: boolean
} {
  const { store, trouble, nowhere } = read(projectPath)
  return { notes: store.notes, trouble, nowhere }
}

/**
 * How many notes one project holds, for the health check.
 *
 * The health check has no project — it is a GET on `/healthz` from whoever
 * started this app — so it asks with `null` and gets `nowhere`, which is the
 * honest answer: this app is running, and how many notes exist is a question
 * about a project nobody has named. See `answer()` in `doors.ts` for what it
 * reports instead of a number it cannot have.
 */
export function howMany(projectPath: string | null | undefined): {
  total: number
  trouble: string | null
  nowhere: boolean
} {
  const { store, trouble, nowhere } = read(projectPath)
  return { total: store.notes.length, trouble, nowhere }
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
function ingest(
  projectPath: string | null | undefined,
  store: Store,
  op: Extract<Op, { op: 'ingest' }>,
  by: string,
): Outcome {
  const named = str(op.path, MAX_PATH)
  if (!named) return { ok: false, error: 'An ingestion has to name the file it read. Nothing was stored.' }
  /* The same spelling the notes in the store are carrying, for the comparison
     three lines down. `read()` hands every stored path back joined onto the
     project's own root; a caller that named the same file by a symlinked prefix
     would otherwise match none of them, and this function would mark every note
     on the document as gone from a source it never left. */
  const roots = rootsOf(projectPath)
  const path = resolved(roots, stored(roots, named))

  /* The project half of this test is gone: every note in this store is already
     this project's, because of which file was opened. What is left is the file
     — an ingestion reconciles ONE document, and a note about another chapter
     must not be marked gone because this chapter was read. */
  const mine = store.notes.filter((one) => one.path === path && one.source)
  const byKey = new Map(mine.map((one) => [one.source!.key, one]))
  const stamp = now()

  let added = 0
  let moved = 0
  let revived = 0
  let reread = 0
  let retired = 0
  /**
   * Notes whose key this read spelled differently, with nothing else about them
   * changed.
   *
   * Counted only so that the corrected key is actually written down. It is not
   * in the sentence this returns and should not be: a key is this app's own
   * handle on an annotation, not a fact about anybody's document, and a line
   * announcing that eight identities were re-spelled would be a program
   * reporting its own bookkeeping to somebody looking at their paper. Nothing a
   * reader can see changed, which is the test for what belongs in that sentence.
   *
   * Without it the adoption would happen on every read and be thrown away every
   * time, because a store is only written when something else about it moved.
   */
  let rekeyed = 0
  /**
   * The stored notes this read has accounted for.
   *
   * Notes rather than keys, because a note can now be recognised by something
   * other than its key — see `sameConstruct` — and a set of keys could not say
   * that the note behind an adopted one is spoken for.
   */
  const claimed = new Set<Note>()

  /**
   * The stored note an annotation is, when its key does not say so.
   *
   * ## Why there has to be a second way to recognise a note at all
   *
   * The key is a hash of the annotation's WORDS, and that is the right identity
   * for the thing it was designed against: an annotation that MOVED is the note
   * it already was, and only one whose author reworded it is a new one. Both of
   * those follow from hashing the words, and both are right.
   *
   * What the key cannot survive is a change in how this app EXTRACTS those
   * words. Stripping rule lines out of a comment run changed the text of seven
   * notes in the store it was first run against, without a byte of any file
   * changing. Under the key rule alone every one of them would have forked: a
   * new note beside an old one marked gone from a source it never left, with
   * the replies on the wrong side of the pair. That is this program announcing
   * its own bug fix by duplicating somebody's notes.
   *
   * So: same construct, and the same SOURCE TEXT under it. `quoted` is the
   * exact slice of the file between the annotation's two ends, wrapper
   * included, and it is the field that tells the two cases apart. A rule change
   * leaves it byte-identical — the file did not move and nothing in it changed,
   * only what this app read out of those bytes. An author rewording a
   * `\todo{}` changes it, every time, because the words are inside the slice.
   *
   * That distinction is not decorative. `\todo{cite Lamport here}` becoming
   * `\todo{cite Fischer here}` is the same length and sits at the same offsets,
   * so a rule that matched on position would adopt it, silently replace the
   * body, and leave the reply that says "no, this is Fischer" attached to a
   * note that now says Fischer. There is a test for exactly that, and it is the
   * reason this compares the slice rather than the place.
   *
   * A note already claimed is never a candidate, so nothing is adopted away
   * from the annotation it actually is.
   */
  const adopt = (kind: 'todo' | 'comment', quoted: string): Note | undefined =>
    mine.find((one) => !claimed.has(one) && one.source?.kind === kind && one.quoted === quoted)

  for (const found of op.found) {
    const sourceKey = str(found.key, MAX_PATH)
    const body = str(found.body, MAX_BODY)
    const quoted = str(found.quoted, MAX_QUOTE)
    /* An annotation with no words is not an annotation, and one whose source
       slice will not fit the quote bound cannot be re-anchored later — see the
       essay on `MAX_QUOTE`. Both are skipped rather than stored half-formed. */
    if (!sourceKey || !body || !quoted) continue

    const already = byKey.get(sourceKey)
    if (already && !claimed.has(already)) {
      claimed.add(already)
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
      already.source = {
        key: sourceKey,
        kind: found.kind,
        present: true,
        seenAt: stamp,
        goneAt: null,
        /* Carried, not cleared. A note that was re-read once is a note whose
           body this app changed, and that stays on the record for as long as
           the note does. `withdrawn` is cleared, because an annotation that is
           being lifted again is not one this app is refusing to lift. */
        withdrawn: null,
        reread: already.source?.reread ?? null,
      }
      continue
    }

    /* The same construct, under a key this app now spells differently. */
    const same = adopt(found.kind, quoted)
    if (same) {
      claimed.add(same)
      if (same.source?.key !== sourceKey) rekeyed++
      const was = same.body
      if (same.source && !same.source.present) revived++
      if (was !== body) {
        reread++
        same.body = body
      }
      same.quoted = quoted
      same.fingerprint = fingerprint(quoted)
      same.source = {
        key: sourceKey,
        kind: found.kind,
        present: true,
        seenAt: stamp,
        goneAt: null,
        withdrawn: null,
        /* The first re-read is the one worth keeping. A second one recording
           what the first re-read said would replace the AUTHOR's words with
           this app's previous rendering of them, which is the opposite of the
           point. */
        reread: same.source?.reread ?? (was === body ? null : { at: stamp, was }),
      }
      continue
    }

    store.notes.push({
      id: mint('n'),
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
      source: { key: sourceKey, kind: found.kind, present: true, seenAt: stamp, goneAt: null, withdrawn: null, reread: null },
    })
    added++
  }

  /*
   * What the same read saw and would no longer call an annotation.
   *
   * Matched the same two ways a kept annotation is — by key first, then by the
   * construct's own place — and it can only ever MARK. A withdrawn annotation
   * never becomes a note, so a store that has never seen one of these gets
   * nothing at all from this loop, which is what makes turning a rule on safe
   * for somebody who was not here when it was off.
   */
  for (const found of op.withdrawn ?? []) {
    const sourceKey = str(found.key, MAX_PATH)
    const already = byKey.get(sourceKey)
    const note = already && !claimed.has(already) ? already : adopt(found.kind, str(found.quoted, MAX_QUOTE))
    if (!note?.source) continue
    claimed.add(note)
    if (note.source.withdrawn) continue
    note.source = { ...note.source, present: false, goneAt: note.source.goneAt ?? stamp, withdrawn: WITHDRAWN }
    retired++
  }

  let gone = 0
  for (const note of mine) {
    const source = note.source
    if (!source || claimed.has(note)) continue
    /* Marked once. A note already known to be gone keeps the date it went,
       because "when did this stop being in the file" is the useful fact and
       re-stamping it on every read would turn it into "when was this file last
       read", which is already `seenAt` on everything else. */
    if (!source.present) continue
    note.source = { ...source, present: false, goneAt: stamp }
    gone++
  }

  if (added || gone || moved || revived || reread || retired || rekeyed) {
    const refused = write(projectPath, store)
    if (refused) return { ok: false, error: refused }
  }
  return {
    ok: true,
    said:
      `Read ${op.found.length} in ${path}: ${added} new, ${moved} re-anchored, ${gone} no longer in the source`
      + `${revived ? `, ${revived} back in it` : ''}`
      + `${reread ? `, ${reread} re-read from the source under this app’s current rules` : ''}`
      + `${retired ? `, ${retired} withdrawn as part of the file’s build rather than annotation` : ''}.`,
    id: '',
  }
}

/**
 * The sentence a withdrawn note carries, in one place.
 *
 * One string rather than one per rule, because there is one rule today and a
 * second one would want its own words — at which point it comes in as an
 * argument rather than being pasted. It says what happened, who did it, and
 * what is still true, because the reader meeting it is looking at a note about
 * a file they have open and can see is unchanged.
 */
const WITHDRAWN =
  'This app no longer reads the part of the file before \\begin{document} as annotation — it is the build: the '
  + 'document class, the fonts, and the macros that define the note commands themselves. The paper module folds the '
  + 'same region away and never draws it, and the two of them disagreeing about what the document is was the reason '
  + 'this changed. Nothing was removed from the file and nothing here was deleted: the note, its replies and its '
  + 'resolution are all still on this record.'
