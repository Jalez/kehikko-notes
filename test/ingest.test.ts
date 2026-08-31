import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * The author's annotations, lifted out of a real `.tex` on a real disk.
 *
 * Real files for the reason `doors.test.ts` uses them: half of what is being
 * tested is what happens when the file CHANGES underneath the store, and a stub
 * cannot be edited between two reads in the way an author edits a chapter
 * between two afternoons.
 *
 * Everything here goes through the doors rather than through `change()`
 * directly, because the promise being tested is the one a person and an agent
 * actually get: look at a document twice and see one note, not two.
 */
const home = mkdtempSync(join(tmpdir(), 'kehikko-notes-ingest-'))
const project = join(home, 'thesis')
mkdirSync(join(project, 'chapters'), { recursive: true })

const CHAPTER = join(project, 'chapters', 'bridge.tex')

const ORIGINAL = [
  '% ============================================',
  '% Why this chapter is here and not in the wire',
  '% ============================================',
  '',
  '\\section{The bridge}',
  '',
  'A module is one origin or it is nothing. \\todo{cite Lamport here}',
  '',
  '\\missing{a figure showing the three rungs}',
  '',
  'A closing paragraph.',
].join('\n')

process.env.NOTES_ROOTS = home
process.env.NOTES_AGENT = 'a test agent'

const { answer } = await import('../doors.ts')
const { forgetReads } = await import('../notes/ingest.ts')

function rpc(name: string, args: Record<string, unknown>) {
  const reply = answer(
    'POST',
    '/mcp',
    new URLSearchParams(),
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
    null,
  )
  const body = reply?.body as { result?: { content?: { text?: string }[]; isError?: boolean } }
  return { text: body.result?.content?.[0]?.text ?? '', failed: body.result?.isError === true }
}

const OF_PROJECT = { projectPath: project }
const ON_CHAPTER = { ...OF_PROJECT, path: CHAPTER }

/** How many notes the `notes` tool printed. Ids are the one line per note. */
function count(text: string): number {
  return (text.match(/^n[a-z0-9]+/gm) ?? []).length
}

function ids(text: string): string[] {
  return text.match(/^n[a-z0-9]+/gm) ?? []
}

beforeEach(() => {
  /* The store is inside the project now, so emptying it is emptying that. */
  rmSync(join(project, '.kehikot'), { recursive: true, force: true })
  writeFileSync(CHAPTER, ORIGINAL)
  forgetReads()
})

afterAll(() => {
  rmSync(home, { recursive: true, force: true })
})

describe('reading a chapter twice produces one note and not two', () => {
  test('the author’s annotations arrive without anybody asking for them', () => {
    /* Asking for the notes on a document is enough. The alternative was a
       button, which would ask a person to press something to be shown
       information the program already has — and a press that would never mean
       no. See `notes/ingest.ts`. */
    const out = rpc('notes', ON_CHAPTER)
    expect(out.failed).toBe(false)
    expect(out.text).toContain('cite Lamport here')
    expect(out.text).toContain('a figure showing the three rungs')
    expect(out.text).toContain('Why this chapter is here')
    /* Three: two macros and one comment run. The banner rules either side of
       the run are horizontal lines and not annotations. */
    expect(count(out.text)).toBe(3)
  })

  test('a second look is the same three notes, with the same ids', () => {
    const first = rpc('notes', ON_CHAPTER)
    forgetReads()
    const second = rpc('notes', ON_CHAPTER)
    expect(count(second.text)).toBe(3)
    expect(ids(second.text)).toEqual(ids(first.text))
  })

  test('an annotation that has MOVED is re-anchored rather than duplicated', () => {
    /* The whole reason the key hashes the words. An author adding a paragraph
       above a `\todo{}` moves every byte offset below it, and a key made of a
       position would produce a second note for every annotation in the file. */
    const first = rpc('notes', ON_CHAPTER)
    writeFileSync(CHAPTER, `A paragraph nobody had written yet.\n\n${ORIGINAL}`)
    forgetReads()
    const second = rpc('notes', ON_CHAPTER)

    expect(count(second.text)).toBe(3)
    expect(ids(second.text)).toEqual(ids(first.text))
    /* And the offsets were corrected, so the notes are still anchored rather
       than reported adrift. */
    expect(second.text).not.toContain('[ADRIFT]')
  })
})

describe('nothing is ever deleted, whatever the author does to the file', () => {
  test('an annotation taken out of the source is marked gone and kept', () => {
    rpc('notes', ON_CHAPTER)
    writeFileSync(CHAPTER, ORIGINAL.replace(' \\todo{cite Lamport here}', ''))
    forgetReads()
    const after = rpc('notes', ON_CHAPTER)

    expect(count(after.text)).toBe(3)
    expect(after.text).toContain('GONE FROM SOURCE')
    expect(after.text).toContain('cite Lamport here')
  })

  test('a reply written about it survives the annotation leaving the file', () => {
    /* The likeliest reason a `\todo{}` left a chapter is that somebody DID it,
       and what they said about how is exactly the record worth keeping. A note
       that disappeared because a file was edited is the failure this module's
       whole design refuses. */
    const first = rpc('notes', ON_CHAPTER)
    const id = ids(first.text)[0]!
    rpc('reply_to_note', { ...OF_PROJECT, note: id, body: 'done in the rewrite, see the bridge chapter' })

    writeFileSync(CHAPTER, 'A chapter with nothing left in it at all.\n')
    forgetReads()
    const after = rpc('notes', ON_CHAPTER)
    expect(after.text).toContain('done in the rewrite')
  })

  test('an annotation that comes back is present again rather than a new note', () => {
    const first = rpc('notes', ON_CHAPTER)
    writeFileSync(CHAPTER, 'nothing here\n')
    forgetReads()
    rpc('notes', ON_CHAPTER)
    writeFileSync(CHAPTER, ORIGINAL)
    forgetReads()
    const back = rpc('notes', ON_CHAPTER)

    expect(count(back.text)).toBe(3)
    expect(ids(back.text)).toEqual(ids(first.text))
    expect(back.text).not.toContain('GONE FROM SOURCE')
  })
})

describe('what a person wrote is never overwritten by a file', () => {
  test('re-reading does not un-resolve a note somebody closed', () => {
    /* Resolving is a judgement about the note; re-reading the file is a report
       about the file. A `\todo{}` still in the source is not evidence that the
       person was wrong. */
    const first = rpc('notes', ON_CHAPTER)
    const id = ids(first.text)[0]!
    rpc('resolve_note', { ...OF_PROJECT, note: id, done: true })
    forgetReads()

    const open = rpc('notes', ON_CHAPTER)
    expect(ids(open.text)).not.toContain(id)
    const all = rpc('notes', { ...ON_CHAPTER, include_resolved: true })
    expect(all.text).toContain('resolved by')
  })

  test('rewording an annotation forks it rather than rewriting the thread', () => {
    /* Somebody answers `\todo{cite Lamport here}` with "no, this is Fischer";
       the author rewrites the macro. Recognising it as the same note and
       replacing the body would leave the reply attached to a question it does
       not answer, with nothing recording what it used to say. */
    const first = rpc('notes', ON_CHAPTER)
    const id = ids(first.text).find((one) => first.text.includes(one)) ?? ''
    rpc('reply_to_note', { ...OF_PROJECT, note: id, body: 'no, this is Fischer' })

    writeFileSync(CHAPTER, ORIGINAL.replace('cite Lamport here', 'cite Fischer here'))
    forgetReads()
    const after = rpc('notes', ON_CHAPTER)

    expect(after.text).toContain('cite Fischer here')
    expect(after.text).toContain('cite Lamport here')
    expect(after.text).toContain('GONE FROM SOURCE')
    /* The answer is still on the note it answered. */
    expect(after.text).toContain('no, this is Fischer')
    expect(count(after.text)).toBe(4)
  })
})

describe('a derived note says it is derived, to a person and to an agent', () => {
  test('the byline names the source and the line says which construct', () => {
    const out = rpc('notes', ON_CHAPTER)
    expect(out.text).toContain('the author, in the source')
    expect(out.text).toContain('[from the source macro]')
    expect(out.text).toContain('[from the source comment]')
  })

  test('a note somebody typed carries no such mark', () => {
    rpc('add_note', {
      ...ON_CHAPTER,
      from: 0,
      to: 9,
      quoted: '% =======',
      body: 'a thought somebody had in the pane',
    })
    const out = rpc('notes', ON_CHAPTER)
    const line = out.text.split('\n').find((one) => out.text.includes('a thought somebody had')) ?? ''
    expect(line).not.toContain('from the source')
    expect(out.text).toContain('over MCP')
  })
})

describe('reading files is bounded by what this app was already allowed to open', () => {
  test('asking for everything in a project reads no file at all', () => {
    /* No amount of browsing scans a tree. The ingestion happens only when the
       scope names a document. */
    const out = rpc('notes', { ...OF_PROJECT, everything: true })
    expect(out.failed).toBe(false)
    expect(count(out.text)).toBe(0)
  })

  test('a document outside every root is invisible rather than refused', () => {
    /* The same silence a note on such a path already gets when its anchor
       cannot be verified — see `notes/source.ts`. The tool says so in a
       sentence, because an agent that asked explicitly needs to know nothing
       happened. */
    const out = rpc('read_source_notes', { ...OF_PROJECT, path: '/etc/hosts' })
    expect(out.failed).toBe(true)
    expect(out.text).toContain('NOTES_ROOTS')
  })

  test('the tool reads again on demand and says what it did', () => {
    rpc('notes', ON_CHAPTER)
    const out = rpc('read_source_notes', ON_CHAPTER)
    expect(out.failed).toBe(false)
    expect(out.text).toMatch(/Read 3 in .*bridge\.tex/)
    expect(count(out.text)).toBe(3)
  })
})
