/**
 * What a note IS, and every bound on it — with nothing in this file that
 * touches a disk.
 *
 * ## Why the shapes live apart from the store
 *
 * The page draws notes and the server holds them, and both have to agree about
 * what one is. A hand-written copy of these types on the browser side would be
 * a second definition that silently disagrees with the first the moment a row
 * grows a field, so there is one definition and both sides import it.
 *
 * That works only because nothing here imports `node:` anything. `notes/keep.ts`
 * does, and a VALUE import of it from the page would drag `node:fs` into the
 * browser bundle — where `tsc` says nothing, `bun test` says nothing, and the
 * only symptom is a page that loads and never answers the host's greeting,
 * because the bundle threw before React ran. That failure has cost this
 * codebase days across three modules. Types-only files are how it is avoided
 * rather than remembered.
 */

/**
 * How long anything a caller sends may be.
 *
 * Every one of these is load-bearing rather than hygiene. The callers are this
 * app's own page, an agent through the MCP door, and whatever else on this
 * machine found the port — loopback is a fence around the machine and not
 * around the programs on it. A string has a length before it has a meaning.
 */
export const MAX_ID = 40
export const MAX_BODY = 4000
export const MAX_BY = 80
/**
 * A document path, bounded at Linux's `PATH_MAX` for the reason the protocol
 * bounds its own there: it is the larger of the two numbers a machine is likely
 * to be standing on, so the bound never refuses a path the operating system was
 * willing to hand out.
 */
export const MAX_PATH = 4096
/**
 * The quoted passage, at the protocol's own bound for a quote in a context.
 *
 * The same number on purpose. A note is written FROM a passage the host
 * relayed, so a quote this app accepted but the wire could not carry would be a
 * note that can never be re-anchored from a live selection again.
 */
export const MAX_QUOTE = 2000
/** How many replies one note may carry before it is a conversation in the wrong place. */
export const MAX_REPLIES = 200

/**
 * A reply on a note. Deliberately smaller than a note: it has no anchor of its
 * own, because it is about the note rather than about the document.
 */
export interface Reply {
  id: string
  body: string
  by: string
  /** Whether it came through the MCP door. Printed on the row; see `Note.viaMcp`. */
  viaMcp: boolean
  at: string
}

/**
 * One note: a thing somebody wrote about a place in a document.
 *
 * ## The anchor is four fields and one of them is the words
 *
 * `path` and `page` say which document and which sheet. `from` and `to` are
 * byte offsets into that file and are null for a note written with nothing
 * selected — a note about a whole page, which is a real thing to write and not
 * a degenerate range.
 *
 * `quoted` is what was there at the moment the note was written, and it is the
 * most important field on this object. Offsets rot: somebody adds a paragraph
 * above and every number below it is wrong, with nothing in the numbers able to
 * say so. The words do not rot. Holding both is what lets this app tell a note
 * that still points at its sentence from one that has been left behind — see
 * `notes/anchor.ts`, which is where the whole argument is.
 *
 * `fingerprint` is the same information hashed, and it is here so a note can be
 * recognised across a copy of the store where the quote was normalised
 * differently, and so two notes on the same sentence are cheap to spot. It is
 * derived from `quoted` and never trusted over it.
 *
 * ## There is no project on a note, and there used to be two fields for one
 *
 * A note carried `project` and `projectPath`, and a `projectKey` helper turned
 * the pair into the key everything partitioned on. Both are gone, because the
 * FILE a note is in now says which project it belongs to: `store.ts` opens
 * `<projectPath>/.kehikot/notes/notes.json`, so a note in that file is that project's
 * by virtue of where it is sitting.
 *
 * Keeping the fields as well would be two sources for one fact, and the failure
 * that produces is not hypothetical. The whole point of moving the store into
 * the project was that it becomes a plain JSON file in somebody's repository,
 * and the obvious thing to do with one of those is copy it — to another
 * checkout, into a colleague's project, out of a backup. Every note in the copy
 * would go on claiming to belong to the folder it came FROM, and anything that
 * believed the field over the location would draw them under the wrong
 * project's name. A file cannot be wrong about where it is.
 *
 * Notes on one project's thesis still must not appear beside another's. That
 * rule is now enforced by the shape of the filesystem rather than by a filter,
 * which is worth more than the filter was: a filter is a rule with a chance of
 * being forgotten at every new call site, and a location has none.
 *
 * ## `viaMcp`, printed and never inferred
 *
 * A note written by an agent through the door and a note typed by the person at
 * this machine are different claims, and a reader who cannot tell them apart
 * reads a pile of assertions and believes all of them equally. So the record
 * says which door it came through, on the row, always.
 */
/**
 * Where a note came from, when it was not typed by anybody.
 *
 * ## Why a note has to say this about itself
 *
 * The row already says which DOOR a note came through — `viaMcp` — for a reason
 * spelled out above: "a person's note and an agent's note about the same
 * sentence on this machine are different claims, and a reader who cannot tell
 * them apart reads a pile of assertions and believes all of them equally."
 *
 * A note lifted out of a `\todo{}` in the author's own `.tex` is a third kind
 * of claim and the same rule applies twice over. Nobody wrote it HERE. It was
 * not a thought somebody had about a passage while reading; it is a thing the
 * author wrote inside the document, that this program went and fetched. A
 * reader must be able to tell "I wrote this in the container" from "the author wrote
 * this in the source", and so must an agent over MCP, because the two want
 * different things done about them: one is a conversation, the other is a task
 * list somebody keeps in their own file and will edit there.
 */
export interface Source {
  /**
   * The stable identity of this annotation, derived from its TEXT.
   *
   * Never from its offset. The whole problem of lifting notes out of a document
   * is that the document is edited underneath them: a key made of a byte
   * position produces a second note every time anybody adds a paragraph above
   * it, and a chapter re-read twice becomes a chapter with two of everything.
   * Hashing the words means a note that has MOVED is recognised as the note it
   * already was, and only a note whose words CHANGED is a new one — which is
   * the right reading, and see `sourceEdit` below for what happens then.
   *
   * The path is part of it, so the same sentence in two chapters is two notes.
   */
  key: string
  /** Which construct it came out of: a todonotes macro, or a run of `%` lines. */
  kind: 'todo' | 'comment'
  /**
   * Whether the last read of the file still found it.
   *
   * False does not mean deleted, and nothing here ever deletes. An annotation
   * that has gone from the source is a note whose subject somebody removed —
   * possibly by DOING it — and the conversation on it, and the fact that it
   * once existed, are exactly the record this module refuses to lose. A note
   * that quietly disappeared because somebody edited a file is the failure the
   * whole anchoring design is arranged against.
   */
  present: boolean
  /** When the file was last read and this annotation was found in it. */
  seenAt: string
  /** When the file was last read and it was NOT, or null while it still is. */
  goneAt: string | null
  /**
   * Why this app stopped lifting it, when the reason was THIS APP and not the
   * author. Null for every note whose annotation is still there, and for every
   * one whose annotation the author removed.
   *
   * ## Two ways a note can stop being present, and they are not the same news
   *
   * `present: false` already says "the last read did not find it". Until now
   * that could only mean one thing — somebody edited the file — and the whole
   * design leans on that reading: a `\todo{}` that left the source most likely
   * left because the author DID it, and the conversation about how is the
   * record this module refuses to lose.
   *
   * A rule change is the other way, and reading it as the first would be a lie
   * about somebody's file. When this app decided that the preamble is build
   * rather than annotation, ten notes in this store stopped being lifted with
   * nobody having touched a byte of `main.tex`. Marking them "gone from source"
   * and saying nothing else would tell a reader that the author had removed a
   * build header they are still looking at.
   *
   * So the sentence is stored, on the note, in the words a person reads — a
   * SENTENCE and not a code, for the same reason every refusal in `keep.ts` is
   * one: whoever meets it, a reader or an agent at the door, has to be told what
   * happened, and a flag would need a lookup table living somewhere else.
   *
   * Nothing is deleted, here least of all. A withdrawn note keeps its id, its
   * words, its replies and its resolution; it is taken out of the ordinary list
   * and put behind one press, which is what "not silent" means when the honest
   * answer is that these were never annotations about the paper.
   */
  withdrawn?: string | null
  /**
   * When this app's own READING of the same annotation changed, and what it
   * used to say.
   *
   * The key is a hash of the annotation's words, so a change in how those words
   * are extracted is a change of key — and a change of key is, by the rule in
   * `ingest()`, a different note. That rule is right when the AUTHOR reworded
   * something: the old note carries replies about what it actually said, and
   * forking loses nothing. It is wrong when the words did not change and this
   * program's reading of them did, which is what stripping rule lines out of a
   * comment run did to seven notes in this store at once. A fork there would be
   * this app duplicating somebody's notes to announce its own bug fix.
   *
   * So a re-read that lands on the same construct — same kind, same offsets,
   * same file — adopts the note that is already there and records this. The old
   * text is kept because it is what the replies underneath were written
   * against, and a body that changed with nothing saying so is exactly the
   * silent rewrite this module spends its length refusing.
   */
  reread?: { at: string; was: string } | null
}

export interface Note {
  id: string
  path: string
  page: number | null
  from: number | null
  to: number | null
  quoted: string
  fingerprint: string
  body: string
  by: string
  viaMcp: boolean
  at: string
  /**
   * Whether somebody has said this is dealt with.
   *
   * Resolved rather than deleted, and there is no delete here at all. A note is
   * a record of what somebody thought about a sentence at a time; deleting it
   * removes the reason a sentence was changed along with the note. Resolved
   * notes are hidden by default and one press away, which is the difference
   * between a tidy list and a lost one.
   */
  resolved: boolean
  resolvedAt: string | null
  resolvedBy: string | null
  replies: Reply[]
  /**
   * Where this came from, or null for a note somebody typed.
   *
   * Optional on the way IN because the store is a JSON file with no migrations:
   * every note written before this field existed is a note somebody typed, and
   * `null` is the true answer for all of them. Read it through `sourceOf`
   * rather than directly, so that "absent" and "explicitly null" cannot come
   * out as two different things anywhere.
   */
  source?: Source | null
}

/** A note's provenance, with an old record's silence read as "a person typed it". */
export function sourceOf(note: Pick<Note, 'source'>): Source | null {
  return note.source ?? null
}

/**
 * Everything ONE PROJECT's store holds, as it sits on disk.
 *
 * One project's, because the file is `<projectPath>/.kehikot/notes/notes.json` and
 * the path is the partition — see `store.ts`. There is deliberately no project
 * key anywhere in this shape: a store that has never heard of a project has no
 * way to show one project's notes under another's name.
 *
 * `version` is kept at 1 and did not go up when the notes moved. It describes
 * the shape of what is inside the file, and the shape did not change — two
 * fields left every note, which every reader here already tolerates being
 * absent. What changed is WHERE the file is, and a version number inside a
 * document cannot say anything about that.
 */
export interface Store {
  version: 1
  notes: Note[]
}

/**
 * The words of a quote, in the one spelling everything compares.
 *
 * Whitespace is collapsed and the ends are trimmed, and that is the whole of
 * it. The reason is that the two things being compared came from different
 * places: the quote was taken from RENDERED text in a browser, where a line
 * break in the `.tex` became a space and an indent became nothing, while the
 * file has the source. A comparison that demanded them to be byte-identical
 * would call every multi-line selection adrift the moment it was written, which
 * is an alarm that is always on and therefore never read.
 *
 * It stops there deliberately. Case is NOT folded and punctuation is NOT
 * stripped: a note written about "the host decides" must not quietly re-anchor
 * onto "The Host Decides" three pages later, because those are two sentences
 * and this app's entire claim is that it does not attach a note to the wrong
 * one.
 */
export function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * A short, stable name for a quote.
 *
 * FNV-1a over the normalised words, hex. Not a cryptographic hash and it does
 * not need to be — nothing here is a secret and nothing is authenticated by it.
 * What it needs to be is the same number on every machine that reads this
 * store, which rules out anything reaching for a runtime's own hashing, and
 * cheap enough to compute for every note on every read.
 *
 * It is a HINT and never the check. Two different sentences can collide; the
 * words themselves cannot. Everything that decides whether a note still points
 * at its sentence compares `quoted`, and this exists so that a list of notes
 * can be grouped and de-duplicated without comparing every pair of paragraphs.
 */
export function fingerprint(quoted: string): string {
  const text = normalise(quoted)
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}
