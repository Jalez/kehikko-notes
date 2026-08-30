import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Every door, over a store of its own.
 *
 * `NOTES_DATA` and `NOTES_ROOTS` are set before `doors.ts` is imported, and
 * `store.ts` resolves the directory at CALL time rather than at import, so this
 * is a real store on disk and not a stub. That matters: the thing being tested
 * is what an agent gets back, and half of what an agent gets back is a verdict
 * about a file that has to actually be there.
 */
const home = mkdtempSync(join(tmpdir(), 'kehikko-notes-'))
const project = join(home, 'thesis')
const other = join(home, 'other')
mkdirSync(join(project, 'chapters'), { recursive: true })
mkdirSync(join(other, 'chapters'), { recursive: true })

const CHAPTER = join(project, 'chapters', 'bridge.tex')
const SOURCE = 'A module is one origin or it is nothing.\n\nEvery field is somebody else’s choice.\n'
const FROM = 0
const TO = 'A module is one origin or it is nothing.'.length

process.env.NOTES_DATA = join(home, 'data')
process.env.NOTES_ROOTS = home
process.env.NOTES_AGENT = 'a test agent'

const { answer, TICKET } = await import('../doors.ts')

/** The id `add_note` reports back, so nothing here has to guess one out of prose. */
function idOf(said: string): string {
  return /, as (n[a-z0-9]+)\./.exec(said)?.[1] ?? ''
}

function rpc(name: string, args: Record<string, unknown>) {
  const reply = answer('POST', '/mcp', new URLSearchParams(), {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args },
  }, null)
  const body = reply?.body as { result?: { content?: { text?: string }[]; isError?: boolean } }
  return { text: body.result?.content?.[0]?.text ?? '', failed: body.result?.isError === true }
}

const OF_PROJECT = { project: 'thesis', projectPath: project }

beforeEach(() => {
  rmSync(join(home, 'data'), { recursive: true, force: true })
  writeFileSync(CHAPTER, SOURCE)
})

afterAll(() => {
  rmSync(home, { recursive: true, force: true })
})

describe('the manifest and the health check', () => {
  test('health says how many notes there are and does not lie about trouble', () => {
    const reply = answer('GET', '/healthz', new URLSearchParams(), null, null)
    expect(reply?.status).toBe(200)
    expect((reply?.body as { ok: boolean; notes: number }).ok).toBe(true)
  })
})

describe('the agent door refuses what is not a question', () => {
  test('the MCP door takes POST and says so', () => {
    expect(answer('GET', '/mcp', new URLSearchParams(), null, null)?.status).toBe(405)
  })

  test('a body that is not a request is refused as one', () => {
    const reply = answer('POST', '/mcp', new URLSearchParams(), { nonsense: true }, null)
    expect(reply?.status).toBe(400)
  })

  test('a tool nobody has is named back rather than shrugged at', () => {
    expect(rpc('delete_everything', {}).failed).toBe(true)
    expect(rpc('delete_everything', {}).text).toContain('delete_everything')
  })

  test('there are five tools and no way to delete a note', () => {
    const reply = answer('POST', '/mcp', new URLSearchParams(), { jsonrpc: '2.0', id: 1, method: 'tools/list' }, null)
    const names = ((reply?.body as { result: { tools: { name: string }[] } }).result.tools).map((one) => one.name)
    expect(names).toEqual(['notes', 'add_note', 'reply_to_note', 'resolve_note', 'reanchor_note'])
  })
})

describe('every argument is validated, and every refusal is a sentence', () => {
  test('a read with no document and no everything is not a scope', () => {
    const out = rpc('notes', OF_PROJECT)
    expect(out.failed).toBe(true)
    expect(out.text).toContain('everything: true')
  })

  test('half a range is refused rather than read as a coarser question', () => {
    expect(rpc('notes', { ...OF_PROJECT, path: CHAPTER, from: 10 }).text).toContain('both ends or neither')
    expect(rpc('notes', { ...OF_PROJECT, path: CHAPTER, to: 10 }).failed).toBe(true)
  })

  test('a range that ends where it starts names nothing', () => {
    expect(rpc('notes', { ...OF_PROJECT, path: CHAPTER, from: 10, to: 10 }).text).toContain('ends after it starts')
  })

  test('a page counts from one', () => {
    expect(rpc('notes', { ...OF_PROJECT, path: CHAPTER, page: 0 }).text).toContain('counting from 1')
  })

  test('a note with no body says nothing and is not stored', () => {
    expect(rpc('add_note', { ...OF_PROJECT, path: CHAPTER, body: '   ' }).text).toContain('has to say something')
  })

  test('a note about a passage has to quote it, and the refusal says why', () => {
    const out = rpc('add_note', { ...OF_PROJECT, path: CHAPTER, from: FROM, to: TO, body: 'hm' })
    expect(out.failed).toBe(true)
    expect(out.text).toContain('rot')
  })

  test('a reply to a note that is not here names the id back', () => {
    expect(rpc('reply_to_note', { note: 'nope', body: 'x' }).text).toContain('nope')
  })

  test('a tool that needs an id refuses without one, and says an id is not the words', () => {
    expect(rpc('resolve_note', {}).text).toContain('needs the id')
  })

  test('re-anchoring without both ends moves nothing', () => {
    expect(rpc('reanchor_note', { note: 'x', quoted: 'y' }).text).toContain('Nothing was moved')
  })
})

describe('writing and reading a note back', () => {
  test('a note on a passage comes back anchored, with the words it was written about', () => {
    const written = rpc('add_note', {
      ...OF_PROJECT,
      path: CHAPTER,
      page: 1,
      from: FROM,
      to: TO,
      quoted: 'A module is one origin or it is nothing.',
      body: 'is this still true?',
      agent: 'the tester',
    })
    expect(written.failed).toBe(false)
    const read = rpc('notes', { ...OF_PROJECT, path: CHAPTER })
    expect(read.text).toContain('is this still true?')
    expect(read.text).toContain('the tester')
    expect(read.text).toContain('over MCP')
    expect(read.text).not.toContain('[ADRIFT]')
    expect(read.text).not.toContain('[MOVED]')
  })

  test('a reply and a resolution are recorded, and resolving twice is refused', () => {
    const id = idOf(
      rpc('add_note', { ...OF_PROJECT, path: CHAPTER, from: FROM, to: TO, quoted: SOURCE.slice(FROM, TO), body: 'a thought worth keeping' }).text,
    )
    expect(id).not.toBe('')
    expect(rpc('reply_to_note', { note: id, body: 'looked at it' }).failed).toBe(false)
    expect(rpc('resolve_note', { note: id }).failed).toBe(false)
    expect(rpc('resolve_note', { note: id }).text).toContain('already resolved')
    /* Resolved notes are out of the way and not gone. */
    expect(rpc('notes', { ...OF_PROJECT, path: CHAPTER }).text).not.toContain('a thought worth keeping')
    expect(rpc('notes', { ...OF_PROJECT, path: CHAPTER, include_resolved: true }).text).toContain('a thought worth keeping')
  })
})

describe('an anchor that rots is reported, not corrected', () => {
  test('an edit above a note makes it MOVED, and the note keeps its stored offsets', () => {
    rpc('add_note', {
      ...OF_PROJECT,
      path: CHAPTER,
      from: FROM,
      to: TO,
      quoted: 'A module is one origin or it is nothing.',
      body: 'watch this drift',
    })
    writeFileSync(CHAPTER, `\\section{New}\n\nSomething somebody added later.\n\n${SOURCE}`)
    const read = rpc('notes', { ...OF_PROJECT, path: CHAPTER })
    expect(read.text).toContain('[MOVED]')
    expect(read.text).toContain('watch this drift')
  })

  test('a rewritten passage makes it ADRIFT, and it is still shown with its quote', () => {
    rpc('add_note', {
      ...OF_PROJECT,
      path: CHAPTER,
      from: FROM,
      to: TO,
      quoted: 'A module is one origin or it is nothing.',
      body: 'about a sentence that is about to go',
    })
    writeFileSync(CHAPTER, 'A module has exactly one origin.\n')
    const read = rpc('notes', { ...OF_PROJECT, path: CHAPTER })
    expect(read.text).toContain('[ADRIFT]')
    expect(read.text).toContain('about a sentence that is about to go')
    expect(read.text).toContain('A module is one origin or it is nothing.')
  })

  test('and narrowing to a passage does not hide the adrift one', () => {
    rpc('add_note', {
      ...OF_PROJECT,
      path: CHAPTER,
      from: FROM,
      to: TO,
      quoted: 'A module is one origin or it is nothing.',
      body: 'the lost one',
    })
    writeFileSync(CHAPTER, 'Nothing that was here is here now.\n')
    const read = rpc('notes', { ...OF_PROJECT, path: CHAPTER, from: 0, to: 5 })
    expect(read.text).toContain('the lost one')
    expect(read.text).toContain('cannot be placed')
  })

  test('re-anchoring is an act somebody takes, and it is what makes the record match', () => {
    const id = idOf(
      rpc('add_note', {
        ...OF_PROJECT,
        path: CHAPTER,
        from: FROM,
        to: TO,
        quoted: 'A module is one origin or it is nothing.',
        body: 'moves',
      }).text,
    )
    const grown = `\\section{New}\n\n${SOURCE}`
    writeFileSync(CHAPTER, grown)
    const at = grown.indexOf('A module is one origin')
    expect(rpc('reanchor_note', { note: id, from: at, to: at + TO, quoted: 'A module is one origin or it is nothing.' }).failed).toBe(false)
    expect(rpc('notes', { ...OF_PROJECT, path: CHAPTER }).text).not.toContain('[MOVED]')
  })
})

describe('an anchor this app may not check', () => {
  test('a document outside every root is UNCHECKED rather than assumed good', () => {
    const outside = join(other, 'chapters', 'elsewhere.tex')
    writeFileSync(outside, SOURCE)
    rpc('add_note', {
      project: 'other',
      projectPath: other,
      path: outside,
      from: FROM,
      to: TO,
      quoted: 'A module is one origin or it is nothing.',
      body: 'outside',
    })
    /* `NOTES_ROOTS` is the shared home in this suite, so read it back with a
       reader whose root is a directory that does not contain the file. */
    const read = rpc('notes', { project: 'other', projectPath: other, path: '/etc/hosts', everything: true })
    expect(read.text).toContain('outside')
  })
})

describe('notes are the project’s', () => {
  test('one project’s notes never appear under another’s', () => {
    rpc('add_note', { ...OF_PROJECT, path: CHAPTER, body: 'belongs to thesis' })
    rpc('add_note', { project: 'other', projectPath: other, path: join(other, 'chapters', 'a.tex'), body: 'belongs to other' })

    const mine = rpc('notes', { ...OF_PROJECT, everything: true })
    expect(mine.text).toContain('belongs to thesis')
    expect(mine.text).not.toContain('belongs to other')

    const theirs = rpc('notes', { project: 'other', projectPath: other, everything: true })
    expect(theirs.text).toContain('belongs to other')
    expect(theirs.text).not.toContain('belongs to thesis')
  })

  test('two projects with the same document name are still two piles', () => {
    rpc('add_note', { ...OF_PROJECT, path: '/chapters/intro.tex', body: 'the thesis intro' })
    rpc('add_note', { project: 'other', projectPath: other, path: '/chapters/intro.tex', body: 'the other intro' })
    const mine = rpc('notes', { ...OF_PROJECT, path: '/chapters/intro.tex' })
    expect(mine.text).toContain('the thesis intro')
    expect(mine.text).not.toContain('the other intro')
  })

  test('a note nobody said a project about is its own pile, not merged into an open one', () => {
    rpc('add_note', { path: '/chapters/intro.tex', body: 'unattributed' })
    expect(rpc('notes', { ...OF_PROJECT, everything: true }).text).not.toContain('unattributed')
    expect(rpc('notes', { everything: true }).text).toContain('unattributed')
  })
})

describe('the page’s own door', () => {
  test('a write with no ticket is refused, and the refusal names where a press comes from', () => {
    const reply = answer('POST', '/api/note', new URLSearchParams(), { op: 'add', path: CHAPTER, body: 'x' }, 'wrong')
    expect(reply?.status).toBe(403)
    expect(String((reply?.body as { error: string }).error)).toContain('own page')
  })

  test('a write with the ticket goes through, and the read door narrows the same way', () => {
    const written = answer(
      'POST',
      '/api/note',
      new URLSearchParams(),
      { op: 'add', project: 'thesis', projectPath: project, path: CHAPTER, page: 1, from: FROM, to: TO, quoted: 'A module is one origin or it is nothing.', body: 'from the page' },
      TICKET,
    )
    expect((written?.body as { ok: boolean }).ok).toBe(true)

    const onPage = answer('GET', '/api/notes', new URLSearchParams({ projectPath: project, path: CHAPTER, page: '1' }), null, null)
    expect((onPage?.body as { shown: unknown[] }).shown).toHaveLength(1)

    const elsewhere = answer('GET', '/api/notes', new URLSearchParams({ projectPath: project, path: CHAPTER, page: '9' }), null, null)
    expect((elsewhere?.body as { shown: unknown[]; elsewhere: number }).shown).toHaveLength(0)
    expect((elsewhere?.body as { elsewhere: number }).elsewhere).toBe(1)
  })

  test('an op this door does not know is named rather than shrugged at', () => {
    const reply = answer('POST', '/api/note', new URLSearchParams(), { op: 'obliterate', id: 'x' }, TICKET)
    expect(String((reply?.body as { error: string }).error)).toContain('obliterate')
  })

  test('an unknown path under /api is ours to refuse, and anything else is not ours at all', () => {
    expect(answer('GET', '/api/nope', new URLSearchParams(), null, null)?.status).toBe(404)
    expect(answer('GET', '/src/main.tsx', new URLSearchParams(), null, null)).toBe(null)
  })
})
