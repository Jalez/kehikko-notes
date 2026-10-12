import { normalise, type Note } from './shape.ts'

/**
 * Whether a note still points at the sentence it was written about.
 *
 * This is the file the module is FOR. Everything else here — the store, the
 * doors, the page — is arrangement around one decision, and the decision is
 * what to do when somebody edits the `.tex` above a note.
 *
 * ## The failure being designed against
 *
 * A note is anchored to a byte range. Somebody adds a paragraph forty lines
 * up, and every offset below it is now wrong by four hundred bytes. Nothing in
 * a pair of numbers can notice: the range still parses, still lands inside the
 * file, and still names a sentence. It names the WRONG sentence, and a container
 * that draws it looks exactly like a container that is right. That is the specific
 * shape of dishonesty this whole codebase is arranged against, and offsets
 * alone cannot avoid it. Drift is not a risk here; it is a certainty on any
 * document somebody is still writing.
 *
 * ## What was tried before, and what it got right
 *
 * The app this module descends from held a `source_key` on each note, with a
 * comment saying it was "stable across edits (it hashes the note's text, not
 * its offset) so re-opening a chapter re-anchors them instead of duplicating."
 * That instinct is correct and is kept: the WORDS are the durable anchor and
 * the offsets are not.
 *
 * It is not enough on its own, and the gap is worth naming because it is the
 * reason this file is longer than a hash. A hash answers "is this note's text
 * somewhere in this document". It cannot answer "has this note been left
 * behind", because a hash that fails to match is indistinguishable from a note
 * whose sentence was rewritten, deleted, or simply never hashed the same way.
 * The old app therefore had exactly two outcomes — found, or a new note — and
 * the second one silently duplicated.
 *
 * ## So there are five outcomes, and every one of them is said out loud
 *
 * - `exact` — the words at the note's own offsets are still its words.
 * - `moved` — the words are in the file, at a different place. The offsets
 *   rotted and the note did not. This is the ordinary case after an edit and it
 *   is reported, with how far, rather than quietly corrected: a reader who is
 *   never told that anchors move has no reason to believe the ones that say
 *   `exact`.
 * - `adrift` — the words are not in the file at all. Somebody rewrote or
 *   deleted the passage. The note is SHOWN, marked, with its quote, because the
 *   note is still a record of what somebody thought about a sentence and the
 *   sentence having changed is the most interesting thing that has happened to
 *   it. It is never hidden and never silently reattached.
 * - `unverified` — this app could not read the file, so it has no opinion. Not
 *   an error and not a claim of health: a note about a document on a machine
 *   this app cannot see is a note whose anchor is simply unknown, and saying
 *   "fine" about it would be the lie.
 * - `unranged` — the note was written with nothing selected, so it is about a
 *   page and has no range to rot. Its `page` is a weak anchor of its own, and
 *   the sentence says so.
 *
 * ## Nothing here writes
 *
 * A `moved` note is drawn at the place the words are now and stored where it
 * always was. Re-anchoring is a separate, explicit act — `reanchor_note` at the
 * door, one press on the page — because silently rewriting somebody's record to
 * match a file this program guessed about is the same class of act as attaching
 * their note to the wrong sentence. The one difference is that it would be
 * unrecoverable.
 *
 * And nothing here reads a file either. This function is handed the text, so
 * every decision in it is testable without a disk, and the confinement rules
 * about WHICH files may be opened live in one place — `notes/source.ts` — where
 * they can be argued about on their own.
 */
export type AnchorState = 'exact' | 'moved' | 'adrift' | 'unverified' | 'unranged'

export interface Anchor {
  state: AnchorState
  /**
   * Where the note points NOW, which is where anything scoping by range must
   * look. The note's own offsets when `exact`, the found ones when `moved`,
   * null when there is nothing to point at.
   */
  from: number | null
  to: number | null
  /** How many bytes it moved by, or null. Signed: negative means the passage moved up. */
  drifted: number | null
  /** One sentence for a person, and never empty. */
  said: string
}

/**
 * The source, in the one spelling a quote can be compared against, with a byte
 * offset kept for every character that survives.
 *
 * ## Why a map and not two separate normalisations
 *
 * The quote came from RENDERED text in a browser: line breaks in the `.tex`
 * became spaces, indentation became nothing, and a macro may have become its
 * expansion. The file has the source. Comparing them byte for byte would call
 * every multi-line selection adrift the instant it was written — an alarm that
 * is always on, and therefore an alarm nobody reads.
 *
 * So both sides are normalised the same way and compared. But an offset found
 * in normalised text is an offset into a string that does not exist on disk,
 * and reporting it would be worse than reporting nothing: it names a place in a
 * file that is not where the words are. Hence the map. Every character in the
 * normalised text remembers which byte of the real file it came from, so a
 * match found in the tidy string is reported in the real one.
 *
 * Indexed by UTF-16 code unit rather than by code point, deliberately, because
 * that is what `indexOf` counts. A surrogate pair contributes two entries with
 * the same byte span; anything that maps a match back to bytes gets the same
 * answer from either half of it.
 */
export interface Mapped {
  text: string
  /**
   * Byte offset in the source of the character at each index.
   *
   * Typed arrays, because this is built for every character of a document and
   * some documents here are a megabyte of extracted PDF: two arrays of boxed
   * numbers were most of what mapping one cost, and a mapped source is now held
   * between reads — see `notes/source.ts` — so its size is this process's
   * memory. Non-decreasing, which `wordsBetween` leans on.
   */
  startsAt: Int32Array
  /** Byte offset just past that character. */
  endsAt: Int32Array
}

/**
 * What `\s` matches, spelled as a comparison.
 *
 * The same set `normalise` collapses — it has to be, or the two spellings of a
 * passage disagree — and written out rather than asked of a regular expression
 * because this runs once per character of every document. `test/anchor.test.ts`
 * holds it to `/\s/` over every UTF-16 code unit there is.
 */
export function isSpace(code: number): boolean {
  if (code === 0x20 || (code >= 0x09 && code <= 0x0d) || code === 0xa0) return true
  if (code < 0x1680) return false
  return (
    code === 0x1680
    || (code >= 0x2000 && code <= 0x200a)
    || code === 0x2028
    || code === 0x2029
    || code === 0x202f
    || code === 0x205f
    || code === 0x3000
    || code === 0xfeff
  )
}

/**
 * ## Map a document ONCE
 *
 * This walks every character of the source, so it is the expensive thing in
 * this file, and it is a function of the source alone — nothing about a note
 * goes into it. It was nevertheless called from inside `resolveAnchor`, which
 * is to say once per NOTE: twenty notes on one megabyte of PDF text mapped that
 * megabyte twenty times on every read, and a read took two seconds on a server
 * with one thread. `resolveAll` maps each document once now, and the reader in
 * `notes/source.ts` keeps the map until the file changes.
 */
export function mapSource(source: string): Mapped {
  const length = source.length
  const startsAt = new Int32Array(length)
  const endsAt = new Int32Array(length)
  /* The text, as the runs of kept characters with one space between them. */
  const runs: string[] = []
  let kept = 0
  let byte = 0
  let pendingSpace = false
  /* Where the run of non-whitespace being walked began, or -1 between runs. */
  let runFrom = -1

  for (let i = 0; i < length; i++) {
    const code = source.charCodeAt(i)
    /* How many bytes one UTF-16 code unit contributes to UTF-8. A surrogate
       pair is four bytes for two units: two each, which keeps the running total
       right without either half claiming the other's. */
    const width = code < 0x80 ? 1 : code < 0x800 ? 2 : code >= 0xd800 && code <= 0xdfff ? 2 : 3
    if (isSpace(code)) {
      if (runFrom !== -1) {
        runs.push(source.slice(runFrom, i))
        runFrom = -1
      }
      /* A run of whitespace becomes at most one space, and it is remembered at
         the FIRST whitespace byte — so a match that begins after a line break
         reports the break rather than the last space of an indent. */
      if (kept && !pendingSpace) {
        pendingSpace = true
        runs.push(' ')
        startsAt[kept] = byte
        endsAt[kept] = byte + width
        kept++
      } else if (pendingSpace) {
        /* Widen the space we already emitted so the run is accounted for. */
        endsAt[kept - 1] = byte + width
      }
      byte += width
      continue
    }
    pendingSpace = false
    if (runFrom === -1) runFrom = i
    startsAt[kept] = byte
    endsAt[kept] = byte + width
    kept++
    byte += width
  }
  if (runFrom !== -1) runs.push(source.slice(runFrom))

  let text = runs.join('')
  /* Trailing whitespace collapsed to a space that nothing follows. `normalise`
     trims it, so this must too or the two spellings disagree by one character
     on every file that ends in a newline — which is every file. */
  if (kept && pendingSpace) {
    text = text.slice(0, -1)
    kept--
  }

  return { text, startsAt: startsAt.subarray(0, kept), endsAt: endsAt.subarray(0, kept) }
}

/** The first index whose character starts at or after `byte`. `startsAt` never decreases. */
function firstAtOrAfter(startsAt: Int32Array, byte: number): number {
  let low = 0
  let high = startsAt.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if ((startsAt[mid] as number) < byte) low = mid + 1
    else high = mid
  }
  return low
}

/**
 * The normalised words the source holds between two byte offsets.
 *
 * Found by bisection rather than by walking from the top of the document: a
 * note near the end of a long file used to cost the whole file to look at.
 */
function wordsBetween(mapped: Mapped, from: number, to: number): string {
  const first = firstAtOrAfter(mapped.startsAt, from)
  const past = Math.max(first, firstAtOrAfter(mapped.startsAt, to))
  return mapped.text.slice(first, past).trim()
}

/** Every place the words appear, as byte ranges in the real file. */
function occurrences(mapped: Mapped, needle: string): { from: number; to: number }[] {
  if (!needle) return []
  const found: { from: number; to: number }[] = []
  let at = mapped.text.indexOf(needle)
  while (at !== -1) {
    const from = mapped.startsAt[at] as number
    const to = mapped.endsAt[at + needle.length - 1] as number
    found.push({ from, to })
    at = mapped.text.indexOf(needle, at + 1)
  }
  return found
}

/**
 * What has become of one note's anchor.
 *
 * `source` is the file's text, or `null` when this app could not read it. Null
 * is a first-class answer here and not a failure: see `unverified` above.
 *
 * It may also be the text ALREADY MAPPED, which is what anything resolving more
 * than one note against a document must hand over — see `mapSource` for what
 * mapping it again per note cost. A bare string is mapped here, once, for the
 * caller with one note and one question.
 */
export function resolveAnchor(
  note: Pick<Note, 'from' | 'to' | 'quoted' | 'page'>,
  source: string | Mapped | null,
): Anchor {
  if (note.from === null || note.to === null) {
    return {
      state: 'unranged',
      from: null,
      to: null,
      drifted: null,
      said:
        note.page === null
          ? 'Written about this document with nothing selected, so it has no range that could drift.'
          : `Written about page ${note.page} with nothing selected. A page number is a weak anchor — it moves when `
            + 'anything above it is edited — so this note is filed against the document rather than a sentence in it.',
    }
  }

  if (source === null) {
    return {
      state: 'unverified',
      from: note.from,
      to: note.to,
      drifted: null,
      said:
        'This app could not read the document, so it has no idea whether this note still points at its sentence. '
        + 'It is showing the words the note was written about, not the words that are there now.',
    }
  }

  const needle = normalise(note.quoted)
  if (!needle) {
    return {
      state: 'unverified',
      from: note.from,
      to: note.to,
      drifted: null,
      said:
        'This note was stored without the words it was written about, so there is nothing to check its offsets '
        + 'against. Bytes alone cannot tell a good anchor from a rotten one.',
    }
  }

  const mapped = typeof source === 'string' ? mapSource(source) : source

  if (wordsBetween(mapped, note.from, note.to) === needle) {
    return { state: 'exact', from: note.from, to: note.to, drifted: 0, said: 'Still points at the words it was written about.' }
  }

  const found = occurrences(mapped, needle)
  if (!found.length) {
    return {
      state: 'adrift',
      from: null,
      to: null,
      drifted: null,
      said:
        'ADRIFT — the words this note was written about are not in the document any more. Somebody rewrote or '
        + 'removed the passage. The note is kept and shown with its quote, because what somebody thought about a '
        + 'sentence is worth more once the sentence has changed, not less.',
    }
  }

  /* Nearest to where it used to be. A document that repeats a phrase will match
     several times, and the one it moved a little is far likelier than the one on
     the other side of the file. Ties go to the earlier, which is arbitrary and
     stated rather than left to sort order. */
  let best = found[0] as { from: number; to: number }
  for (const one of found) {
    if (Math.abs(one.from - note.from) < Math.abs(best.from - note.from)) best = one
  }

  const drifted = best.from - note.from
  const alsoThere = found.length > 1 ? `, in one of ${found.length} places they appear` : ''

  /*
   * A note can be wrong about where its passage ENDS without being wrong about
   * where it starts — a range recorded one byte short, a selection that snapped
   * outward on one side. Reporting that as "moved 0 bytes" is a sentence that
   * reads as a bug in this program rather than as a fact about the note, and it
   * was written exactly that way until a probe printed it. So the two ends are
   * described separately.
   */
  if (drifted === 0) {
    const off = best.to - note.to
    return {
      state: 'moved',
      from: best.from,
      to: best.to,
      drifted,
      said:
        `MOVED — this note starts where it always did, and its recorded range is the wrong LENGTH: the words it `
        + `quotes end ${Math.abs(off)} byte${Math.abs(off) === 1 ? '' : 's'} ${off > 0 ? 'later' : 'earlier'} than it `
        + `says${alsoThere}. Re-anchor it to make the record match.`,
    }
  }

  const where = drifted > 0 ? `${drifted} bytes later` : `${Math.abs(drifted)} bytes earlier`
  return {
    state: 'moved',
    from: best.from,
    to: best.to,
    drifted,
    said:
      `MOVED — the document was edited above this note, so its recorded offsets are wrong. The words are still `
      + `there, ${where}${alsoThere}. Nothing has been rewritten: re-anchor it to make the record match.`,
  }
}

/** A note with the truth about its anchor beside it. */
export interface Anchored {
  note: Note
  anchor: Anchor
}

/**
 * Every note, resolved against the sources it points into.
 *
 * `read` is handed in rather than imported, so this stays a pure function of
 * its arguments and the rules about which files may be opened stay in one
 * place. It is called once per distinct path, not once per note: a chapter with
 * forty notes on it is read once.
 *
 * And MAPPED once, which is the same sentence about the step after reading and
 * was not true until it was measured. `map` is how a caller that keeps mapped
 * sources between reads hands one back — `notes/source.ts` — and it is asked
 * only when some note on that document actually has words to look for: a
 * document carrying nothing but whole-page notes is never mapped at all.
 */
export function resolveAll(
  notes: Note[],
  read: (path: string) => string | null,
  map: (path: string, source: string) => Mapped = (_path, source) => mapSource(source),
): Anchored[] {
  const sources = new Map<string, string | null>()
  const maps = new Map<string, Mapped>()
  return notes.map((note) => {
    if (!sources.has(note.path)) sources.set(note.path, read(note.path))
    const source = sources.get(note.path) ?? null
    /* The three answers that never look at the document are given without
       mapping it. The conditions are `resolveAnchor`'s own, in its order. */
    if (source === null || note.from === null || note.to === null || !normalise(note.quoted)) {
      return { note, anchor: resolveAnchor(note, source) }
    }
    let mapped = maps.get(note.path)
    if (!mapped) {
      mapped = map(note.path, source)
      maps.set(note.path, mapped)
    }
    return { note, anchor: resolveAnchor(note, mapped) }
  })
}
