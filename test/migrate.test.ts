import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { KEHIKOT_DIR } from 'roadmap-module-protocol'

import { apply, planFrom, report } from '../dev/migrate.ts'

/**
 * Splitting the old one-file store into the projects its notes belong to.
 *
 * ## Why a migration gets tested at all, when it is run once
 *
 * Because it is run once against material nobody can reconstruct. The store
 * this was written for holds fifty-eight notes lifted out of somebody's thesis,
 * some carrying replies about what was said and what was done about it. There
 * is no second copy and no way to write them again.
 *
 * A migration nobody tested is a migration nobody can re-run either, which
 * matters more than it sounds: the first thing anybody does when a migration
 * goes wrong is put the original back and run it again, and that is only an
 * option if running it again is a thing that has been shown to work.
 *
 * So what is asserted here is the order of operations rather than the happy
 * path alone: that nothing is renamed until every destination has been read
 * back and compared, that a note nobody can place is reported rather than
 * dropped, and that a destination which already holds notes stops the whole
 * thing rather than being merged into.
 */

const home = mkdtempSync(join(tmpdir(), 'kehikko-notes-migrate-'))
const thesis = join(home, 'thesis')
const portal = join(home, 'portal')
const old = join(home, 'data')

/** A note in the shape the old store actually wrote, replies and all. */
function note(id: string, projectPath: string | null, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    project: projectPath === null ? null : projectPath.split('/').pop(),
    projectPath,
    path: join(projectPath ?? home, 'main.tex'),
    page: null,
    from: 0,
    to: 10,
    quoted: 'a sentence',
    fingerprint: 'abcdef01',
    body: `what somebody thought about ${id}`,
    by: 'the owner',
    viaMcp: false,
    at: '2026-01-01T00:00:00.000Z',
    resolved: false,
    resolvedAt: null,
    resolvedBy: null,
    replies: [],
    ...extra,
  }
}

function oldStore(notes: unknown[]): string {
  mkdirSync(old, { recursive: true })
  const file = join(old, 'notes.json')
  writeFileSync(file, `${JSON.stringify({ version: 1, notes }, null, 2)}\n`)
  return file
}

function held(project: string): { notes: Record<string, unknown>[] } {
  return JSON.parse(readFileSync(join(project, KEHIKOT_DIR, 'notes', 'notes.json'), 'utf8')) as {
    notes: Record<string, unknown>[]
  }
}

beforeEach(() => {
  rmSync(thesis, { recursive: true, force: true })
  rmSync(portal, { recursive: true, force: true })
  rmSync(old, { recursive: true, force: true })
  mkdirSync(thesis, { recursive: true })
  mkdirSync(portal, { recursive: true })
})

afterAll(() => {
  rmSync(home, { recursive: true, force: true })
})

describe('the split, by the project each note records', () => {
  test('sends each note to the project it says it belongs to', () => {
    const file = oldStore([note('n1', thesis), note('n2', portal), note('n3', thesis)])
    const plan = planFrom(JSON.parse(readFileSync(file, 'utf8')))

    expect(plan.total).toBe(3)
    expect(plan.byProject.get(thesis)).toHaveLength(2)
    expect(plan.byProject.get(portal)).toHaveLength(1)
    expect(plan.stranded).toHaveLength(0)

    const done = apply(plan, file)
    expect(done.refusals).toEqual([])
    expect(held(thesis).notes.map((one) => one.id)).toEqual(['n1', 'n3'])
    expect(held(portal).notes.map((one) => one.id)).toEqual(['n2'])
  })

  /* Nothing a person wrote may be lost, and a reply is the part most easily
     lost: it is nested, so a migration that rebuilt notes field by field would
     drop it without any count going wrong. */
  test('carries replies and resolutions through untouched', () => {
    const rich = note('n1', thesis, {
      resolved: true,
      resolvedAt: '2026-02-02T00:00:00.000Z',
      resolvedBy: 'somebody',
      replies: [
        { id: 'r1', body: 'no, this is Fischer', by: 'an agent', viaMcp: true, at: '2026-01-02T00:00:00.000Z' },
        { id: 'r2', body: 'fixed in chapter 3', by: 'the owner', viaMcp: false, at: '2026-01-03T00:00:00.000Z' },
      ],
      source: { key: 'k', kind: 'todo', present: true, seenAt: 'x', goneAt: null, withdrawn: null, reread: null },
    })
    const file = oldStore([rich])
    apply(planFrom(JSON.parse(readFileSync(file, 'utf8'))), file)

    const after = held(thesis).notes[0]!
    expect(after.replies).toEqual(rich.replies)
    expect(after.resolved).toBe(true)
    expect(after.resolvedBy).toBe('somebody')
    expect(after.source).toEqual(rich.source)
    expect(after.body).toBe(rich.body)
  })

  /* The two fields the file's own location now says. Dropped here rather than
     carried, because a copy of the store moved between projects would otherwise
     have every note claiming to belong where it came from. */
  test('drops project and projectPath, and nothing else', () => {
    const one = note('n1', thesis)
    const file = oldStore([one])
    apply(planFrom(JSON.parse(readFileSync(file, 'utf8'))), file)

    const after = held(thesis).notes[0]!
    expect(after).not.toHaveProperty('project')
    expect(after).not.toHaveProperty('projectPath')
    const { project: _p, projectPath: _pp, ...rest } = one
    expect(after).toEqual(rest)
  })

  /* Including keys this program has never heard of. A migration that rebuilt
     each note from a list of known fields would silently drop anything added
     since that list was written. */
  test('carries a field this program does not know about', () => {
    const file = oldStore([note('n1', thesis, { somethingNewer: { and: 'nested' } })])
    apply(planFrom(JSON.parse(readFileSync(file, 'utf8'))), file)
    expect(held(thesis).notes[0]!.somethingNewer).toEqual({ and: 'nested' })
  })
})

describe('notes nobody can place', () => {
  test('are reported loudly and left in the old file rather than dropped', () => {
    const file = oldStore([
      note('n1', thesis),
      note('nowhere', null),
      note('gone', join(home, 'a-project-that-was-deleted')),
      note('relative', 'thesis'),
    ])
    const plan = planFrom(JSON.parse(readFileSync(file, 'utf8')))

    expect(plan.stranded.map((one) => one.note.id)).toEqual(['nowhere', 'gone', 'relative'])
    expect(plan.stranded[0]!.why).toContain('no projectPath')
    expect(plan.stranded[1]!.why).toContain('there is no folder at')
    expect(plan.stranded[2]!.why).toContain('not absolute')

    const said = report(plan, null)
    expect(said).toContain('3 could NOT be placed')
    expect(said).toContain('nowhere:')

    /* And the file that still holds them is kept, under a name nothing reads. */
    const done = apply(plan, file)
    expect(done.kept).toBe(`${file}.migrated`)
    const back = JSON.parse(readFileSync(done.kept!, 'utf8')) as { notes: { id: string }[] }
    expect(back.notes.map((one) => one.id)).toEqual(['n1', 'nowhere', 'gone', 'relative'])
  })
})

describe('the order, which is the whole safety of this', () => {
  test('the old file is renamed and never deleted', () => {
    const file = oldStore([note('n1', thesis)])
    const before = readFileSync(file, 'utf8')
    const done = apply(planFrom(JSON.parse(before)), file)

    expect(existsSync(file)).toBe(false)
    expect(done.kept).toBe(`${file}.migrated`)
    expect(readFileSync(done.kept!, 'utf8')).toBe(before)
  })

  /* Nothing is renamed until every destination has been written AND read back.
     A refusal discovered halfway through must leave the original in place, or
     the notes are split across two locations with nothing saying which is
     current — which is worse than a migration that never started. */
  test('refuses everything, and keeps the original, when one destination already holds notes', () => {
    mkdirSync(join(portal, KEHIKOT_DIR, 'notes'), { recursive: true })
    writeFileSync(
      join(portal, KEHIKOT_DIR, 'notes', 'notes.json'),
      `${JSON.stringify({ version: 1, notes: [note('already', portal)] }, null, 2)}\n`,
    )

    const file = oldStore([note('n1', thesis), note('n2', portal)])
    const done = apply(planFrom(JSON.parse(readFileSync(file, 'utf8'))), file)

    expect(done.refusals).toHaveLength(1)
    expect(done.refusals[0]).toContain('already holds 1 note')
    expect(done.kept).toBeNull()
    /* The original is untouched — and so is the OTHER project, which had no
       problem of its own. A partial migration is the thing being prevented. */
    expect(existsSync(file)).toBe(true)
    expect(existsSync(join(thesis, KEHIKOT_DIR, 'notes', 'notes.json'))).toBe(false)
    expect(held(portal).notes.map((one) => one.id)).toEqual(['already'])
  })

  test('an empty destination is not in the way, because it holds nothing', () => {
    mkdirSync(join(thesis, KEHIKOT_DIR, 'notes'), { recursive: true })
    writeFileSync(join(thesis, KEHIKOT_DIR, 'notes', 'notes.json'), `${JSON.stringify({ version: 1, notes: [] })}\n`)

    const file = oldStore([note('n1', thesis)])
    const done = apply(planFrom(JSON.parse(readFileSync(file, 'utf8'))), file)
    expect(done.refusals).toEqual([])
    expect(held(thesis).notes.map((one) => one.id)).toEqual(['n1'])
  })

  /* Run it twice. The second run has no old file to read, which is what makes
     re-running safe: the destinations are already full and would refuse anyway,
     but there is nothing to refuse because the source is gone. */
  test('is idempotent: a second run finds nothing to do and changes nothing', () => {
    const file = oldStore([note('n1', thesis), note('n2', portal)])
    apply(planFrom(JSON.parse(readFileSync(file, 'utf8'))), file)

    const after = { thesis: held(thesis), portal: held(portal) }
    expect(existsSync(file)).toBe(false)

    /* And if somebody puts the old file back and runs it again — the ordinary
       "did that work?" reflex — it refuses rather than doubling every note. */
    writeFileSync(file, readFileSync(`${file}.migrated`, 'utf8'))
    const again = apply(planFrom(JSON.parse(readFileSync(file, 'utf8'))), file)
    expect(again.refusals).toHaveLength(2)
    expect(again.kept).toBeNull()
    expect(held(thesis)).toEqual(after.thesis)
    expect(held(portal)).toEqual(after.portal)
  })

  test('a dry run says what it would do and writes nothing at all', () => {
    const file = oldStore([note('n1', thesis), note('n2', portal)])
    const plan = planFrom(JSON.parse(readFileSync(file, 'utf8')))
    const said = report(plan, null)

    expect(said).toContain('2 notes in the old store')
    expect(said).toContain(join(thesis, KEHIKOT_DIR, 'notes', 'notes.json'))
    expect(said).toContain('Run with --apply')
    expect(existsSync(join(thesis, KEHIKOT_DIR))).toBe(false)
    expect(existsSync(join(portal, KEHIKOT_DIR))).toBe(false)
    expect(existsSync(file)).toBe(true)
  })

  test('refuses a file that is not a store at all rather than writing an empty one', () => {
    expect(() => planFrom({ nothing: true })).toThrow('no notes array')
  })
})

describe('what the destination projects get told', () => {
  test('a migrated project has the folder ignored, once', () => {
    mkdirSync(join(thesis, '.git'))
    writeFileSync(join(thesis, '.gitignore'), 'build/\n')

    const file = oldStore([note('n1', thesis)])
    apply(planFrom(JSON.parse(readFileSync(file, 'utf8'))), file)

    const ignore = readFileSync(join(thesis, '.gitignore'), 'utf8')
    expect(ignore.startsWith('build/\n')).toBe(true)
    expect(ignore.split('.kehikot/')).toHaveLength(2)
  })
})
