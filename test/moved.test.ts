import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { KEHIKOT_DIR } from 'kehikot-module-protocol'
import { held } from 'kehikot-module-protocol/client'
import { DOOR_PROJECT_SAYS } from 'kehikot-module-protocol/serve'

import { heldAtProject } from '../src/wire/held-at-project.ts'
import { host } from './host.ts'

/**
 * A project is its id, not its folder. The door asks the host which folder it means and works on
 * that one: a former path is followed, a stranger's folder at the old path is not written to, and
 * with no host nothing is written.
 */
process.env.NOTES_AGENT = 'a test agent'
const { answer, TICKET } = await import('../doors.ts')

const ID = 'proj-notes-one'
const SOURCE = 'A module is one origin or it is nothing.\n'
let dir = ''
let OLD = ''
let NEW = ''
const nothing = new URLSearchParams()

beforeEach(() => {
  host.reset()
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'notes-moved-')))
  process.env.NOTES_ROOTS = dir
  OLD = join(dir, 'before')
  NEW = join(dir, 'after')
})
afterEach(() => {
  host.reset()
  rmSync(dir, { recursive: true, force: true })
})

function renamed(): void {
  mkdirSync(join(OLD, 'chapters'), { recursive: true })
  renameSync(OLD, NEW)
  writeFileSync(join(NEW, 'chapters', 'bridge.tex'), SOURCE)
  host.auto = false
  host.projects.set(NEW, ID)
  host.moved.set(OLD, { to: NEW, id: ID })
}

const addNote = (project: string, file: string) =>
  answer('POST', '/mcp', nothing, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'add_note', arguments: { project, path: file, body: 'a note' } },
  }, null).then((reply) => {
    const result = (reply?.body as { result: { content: { text: string }[]; isError?: boolean } }).result
    return { texts: result.content.map((c) => c.text), isError: result.isError === true }
  })

describe('a project whose folder moved', () => {
  test('a tool call with the former path is followed, writes under the new folder, and says so', async () => {
    renamed()
    const { texts, isError } = await addNote(OLD, join(NEW, 'chapters', 'bridge.tex'))
    expect(isError).toBe(false)
    expect(texts.at(-1)).toBe(DOOR_PROJECT_SAYS.followed(OLD, NEW))
    expect(existsSync(join(NEW, KEHIKOT_DIR, 'notes', 'notes.json'))).toBe(true)
    expect(existsSync(OLD)).toBe(false)
  })

  test('the page’s write with the former path is followed too', async () => {
    renamed()
    const reply = await answer('POST', '/api/note', nothing, {
      op: 'add', projectPath: OLD, path: join(NEW, 'chapters', 'bridge.tex'), page: null, from: 0, to: 5, quoted: 'A mod', body: 'from the page',
    }, TICKET)
    expect(reply?.status).toBe(200)
    expect((reply?.body as { followed?: string }).followed).toBe(DOOR_PROJECT_SAYS.followed(OLD, NEW))
    expect(existsSync(join(NEW, KEHIKOT_DIR, 'notes', 'notes.json'))).toBe(true)
  })

  test('an unrelated folder made at the old path is refused, and nothing is written there', async () => {
    renamed()
    mkdirSync(OLD)
    host.moved.set(OLD, { to: NEW, id: 'proj-someone-else' })
    const { texts, isError } = await addNote(OLD, join(NEW, 'chapters', 'bridge.tex'))
    expect(isError).toBe(true)
    expect(texts[0]).toBe(DOOR_PROJECT_SAYS.moved(NEW))
    expect(existsSync(join(OLD, KEHIKOT_DIR))).toBe(false)
    expect(existsSync(join(NEW, KEHIKOT_DIR))).toBe(false)

    const page = await answer('POST', '/api/note', nothing, { op: 'add', projectPath: OLD, path: 'x', body: 'b' }, TICKET)
    expect((page?.body as { ok: boolean }).ok).toBe(false)
    expect(existsSync(join(OLD, KEHIKOT_DIR))).toBe(false)
  })

  test('a folder the host does not hold is refused, though it exists', async () => {
    mkdirSync(OLD)
    host.auto = false
    const { texts, isError } = await addNote(OLD, join(OLD, 'x.tex'))
    expect(isError).toBe(true)
    expect(texts[0]).toBe(DOOR_PROJECT_SAYS.notProject(OLD))
    expect(existsSync(join(OLD, KEHIKOT_DIR))).toBe(false)
  })

  test('with no host running a door refuses, and writes nothing', async () => {
    mkdirSync(OLD)
    host.up = false
    const { texts, isError } = await addNote(OLD, join(OLD, 'x.tex'))
    expect(isError).toBe(true)
    expect(texts[0]).toBe(DOOR_PROJECT_SAYS.notProject(OLD))
    const page = await answer('POST', '/api/note', nothing, { op: 'add', projectPath: OLD, path: 'x', body: 'b' }, TICKET)
    expect((page?.body as { ok: boolean }).ok).toBe(false)
    expect(existsSync(join(OLD, KEHIKOT_DIR))).toBe(false)
  })

  test('the health check names the refusal rather than counting under a stale path', async () => {
    mkdirSync(OLD)
    host.auto = false
    const reply = await answer('GET', '/healthz', new URLSearchParams({ projectPath: OLD }), null, null)
    const body = reply?.body as { ok: boolean; trouble: string }
    expect(body.ok).toBe(false)
    expect(body.trouble).toBe(DOOR_PROJECT_SAYS.notProject(OLD))
  })
})

describe('drafts across a rename', () => {
  const drafts = held('test.notes.drafts')
  const draft = { base: '', text: 'half a thought', aim: 'a new note' }
  beforeEach(() => sessionStorage.clear())

  test('a draft kept under the id is still there when the path changes', () => {
    heldAtProject(drafts, { projectId: ID, projectPath: OLD })?.keep('new:a', draft)
    expect(heldAtProject(drafts, { projectId: ID, projectPath: NEW })?.read('new:a')).toEqual(draft)
  })

  test('a draft an earlier page kept under the path is moved under the id, once', () => {
    drafts.at(OLD).keep('new:a', draft)
    const here = heldAtProject(drafts, { projectId: ID, projectPath: OLD })
    expect(here?.read('new:a')).toEqual(draft)
    expect(drafts.at(OLD).any()).toBe(false)
    expect(heldAtProject(drafts, { projectId: ID, projectPath: NEW })?.read('new:a')).toEqual(draft)
  })

  test('without an id the path is the key, and with neither nothing is held', () => {
    heldAtProject(drafts, { projectId: null, projectPath: OLD })?.keep('new:a', draft)
    expect(drafts.at(OLD).read('new:a')).toEqual(draft)
    expect(heldAtProject(drafts, { projectId: null, projectPath: null })).toBeUndefined()
  })
})
