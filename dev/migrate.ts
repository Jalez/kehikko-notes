import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { moduleFile } from 'roadmap-module-protocol'

import { ID } from '../manifest.ts'
import { FILE, makeDir } from '../store.ts'

/**
 * Moving the one old `data/notes.json` into the projects its notes are about.
 *
 * ## Why this is a script and not a migration on read
 *
 * Some stores in this codebase migrate themselves when they are opened, and the
 * argument for that is good: a migration that has to be RUN is one the person
 * who needs it does not know exists. It does not work here, and the reason is
 * the shape of the change rather than a preference.
 *
 * A migration on read runs inside a request that already knows which project it
 * is about, and can therefore only ever see one project's share of the old
 * file. Opening the thesis would move the thesis's notes and leave the rest
 * behind, in a file nothing opens any more — and the second project's notes
 * would sit there looking migrated, because the file they are in is the file
 * the migration is supposed to have consumed. Splitting a store by a key is a
 * whole-file operation and has to be run once, by something holding the whole
 * file.
 *
 * ## What it does, in the order it does it, and why the order is the design
 *
 * `bun dev/migrate.ts` says what it WOULD do and touches nothing.
 * `bun dev/migrate.ts --apply` does it. In both cases:
 *
 * 1. Read the old file whole, and group its notes by the `projectPath` each one
 *    records. That field is about to stop existing — the file a note is in now
 *    says which project it belongs to — so this is the last moment it is worth
 *    anything, and it is worth exactly this.
 * 2. Report anything that cannot be placed, LOUDLY. A note with no
 *    `projectPath`, or one naming a folder that is not on this machine, has
 *    nowhere to go. It is never dropped and never guessed at.
 * 3. Refuse outright if any destination already holds notes. Merging is not
 *    something to do quietly with somebody's material, and a re-run that
 *    appended would double every note.
 * 4. Write each project's file, read every one of them back, and compare note
 *    for note — id, body, every reply, the resolution, the source record. Only
 *    if every destination verifies is the original renamed to
 *    `notes.json.migrated`.
 *
 * ## Renamed, and never deleted
 *
 * The 58 notes this was written for are real work, ingested from somebody's
 * thesis, and some carry replies. A migration that half-happened across two
 * locations is worse than one that has not started, so the original is kept
 * under a name nothing reads. If anything here turns out to have been wrong,
 * the evidence is one `mv` away rather than gone.
 *
 * ## What is dropped, and why that is not a loss
 *
 * `project` and `projectPath` come off each note. They said which project it
 * belonged to, and the file it is now in says the same thing — see
 * `notes/shape.ts` for the argument that keeping both would be two sources for
 * one fact, and that the copy in the file would be the one that goes wrong the
 * first time somebody copies a `.kehikot` between projects. Nothing a person
 * wrote is in either field: the host put them there.
 */

/** One note as the old store held it, read as loosely as possible. */
type OldNote = Record<string, unknown> & { id?: unknown; projectPath?: unknown; project?: unknown }

export interface Plan {
  /** Project path → the notes that belong in it, already stripped. */
  byProject: Map<string, Record<string, unknown>[]>
  /**
   * Notes that name no project, or one that is not on this machine.
   *
   * Reported and left in the old file. There is no folder to put them in and
   * inventing one would be this script deciding whose work they are.
   */
  stranded: { note: OldNote; why: string }[]
  total: number
}

/** Read the old store, or say why it could not be read. Nothing is written. */
export function planFrom(store: unknown, exists: (path: string) => boolean = existsSync): Plan {
  const notes = (store as { notes?: unknown })?.notes
  if (!Array.isArray(notes)) {
    throw new Error('that file has no notes array in it, so it is not a store this script can split.')
  }

  const byProject = new Map<string, Record<string, unknown>[]>()
  const stranded: { note: OldNote; why: string }[] = []

  for (const raw of notes as OldNote[]) {
    const path = typeof raw.projectPath === 'string' ? raw.projectPath.trim() : ''
    if (!path) {
      stranded.push({ note: raw, why: 'it records no projectPath, so there is no folder it belongs in' })
      continue
    }
    if (!isAbsolute(path)) {
      stranded.push({ note: raw, why: `its projectPath "${path}" is not absolute` })
      continue
    }
    if (!exists(path)) {
      stranded.push({ note: raw, why: `there is no folder at "${path}" on this machine` })
      continue
    }
    const kept = byProject.get(path) ?? []
    kept.push(stripped(raw))
    byProject.set(path, kept)
  }

  return { byProject, stranded, total: notes.length }
}

/**
 * One note without the two fields the file's location now says.
 *
 * Every other key is carried through untouched, including ones this program has
 * never heard of. A migration that rebuilt each note from a list of fields it
 * knew about would silently drop anything added since that list was written,
 * which is the one thing a migration must not do.
 */
function stripped(note: OldNote): Record<string, unknown> {
  const { project: _project, projectPath: _projectPath, ...rest } = note
  return rest
}

export interface Applied {
  /** Project path → how many notes were written there. */
  written: Map<string, number>
  /** Where the old file went, or null on a dry run or a refusal. */
  kept: string | null
  refusals: string[]
}

/**
 * Do it, having planned it.
 *
 * `from` is the old file. Every destination is `<project>/.kehikot/notes/notes.json`,
 * built by `store.ts`'s own `makeDir` so that the folder is created, the fence
 * is applied and the project's `.gitignore` is told about it in exactly the way
 * a first note written through the app would have done. Using the app's own
 * function rather than a second copy of the logic is deliberate: a migration
 * that created a folder the app would have refused to write into would have
 * moved somebody's notes somewhere the app cannot reach.
 */
export function apply(plan: Plan, from: string): Applied {
  const written = new Map<string, number>()
  const refusals: string[] = []

  /* Every destination is checked BEFORE any of them is written. A refusal
     discovered halfway through would leave the notes split across three places
     with the original still claiming to hold them all. */
  const targets = new Map<string, string>()
  for (const project of plan.byProject.keys()) {
    const made = makeDir(project)
    if (made.trouble || made.dir === null) {
      refusals.push(`${project}: ${made.trouble ?? 'nothing said which project this is'}`)
      continue
    }
    const target = join(made.dir, `${FILE}.json`)
    if (existsSync(target)) {
      let held: unknown
      try {
        held = JSON.parse(readFileSync(target, 'utf8'))
      } catch {
        refusals.push(`${target} already exists and could not be read. Nothing was written over it.`)
        continue
      }
      const already = (held as { notes?: unknown })?.notes
      if (Array.isArray(already) && already.length) {
        refusals.push(
          `${target} already holds ${already.length} note${already.length === 1 ? '' : 's'}. This script will not `
          + 'merge two stores — move that file aside and run again if you meant to replace it.',
        )
        continue
      }
    }
    targets.set(project, target)
  }

  if (refusals.length) return { written, kept: null, refusals }

  for (const [project, notes] of plan.byProject) {
    const target = targets.get(project)!
    writeFileSync(target, `${JSON.stringify({ version: 1, notes }, null, 2)}\n`)
    written.set(project, notes.length)
  }

  /* Read back and compare, every destination, before anything is renamed. The
     comparison is over the whole note rather than over a few fields, so a reply
     or a resolution that failed to survive the round trip is caught by the same
     check that catches a lost id. */
  for (const [project, notes] of plan.byProject) {
    const target = targets.get(project)!
    let back: unknown
    try {
      back = JSON.parse(readFileSync(target, 'utf8'))
    } catch (e) {
      refusals.push(`${target} could not be read back after writing (${String(e)}).`)
      continue
    }
    const got = (back as { notes?: unknown })?.notes
    if (!Array.isArray(got) || got.length !== notes.length) {
      refusals.push(`${target} came back with ${Array.isArray(got) ? got.length : 'no'} notes, not ${notes.length}.`)
      continue
    }
    for (let i = 0; i < notes.length; i += 1) {
      if (JSON.stringify(got[i]) !== JSON.stringify(notes[i])) {
        refusals.push(`${target}: note ${String(notes[i]!.id)} did not come back the way it went in.`)
      }
    }
  }

  if (refusals.length) return { written, kept: null, refusals }

  const kept = `${from}.migrated`
  renameSync(from, kept)
  return { written, kept, refusals }
}

/** Where the old store used to be. */
export function oldFile(): string {
  return fileURLToPath(new URL('../data/notes.json', import.meta.url))
}

export function report(plan: Plan, applied: Applied | null): string {
  const lines: string[] = []
  lines.push(`${plan.total} note${plan.total === 1 ? '' : 's'} in the old store.`)
  for (const [project, notes] of plan.byProject) {
    lines.push(`  ${notes.length} → ${moduleFile(project, ID, FILE)}`)
  }
  if (plan.stranded.length) {
    lines.push('', `${plan.stranded.length} could NOT be placed and would be left in the old file:`)
    for (const one of plan.stranded) lines.push(`  ${String(one.note.id ?? '(no id)')}: ${one.why}`)
  }
  if (!applied) {
    lines.push('', 'Nothing was written. Run with --apply to do it.')
    return lines.join('\n')
  }
  if (applied.refusals.length) {
    lines.push('', 'Refused, and the old file is untouched:')
    for (const why of applied.refusals) lines.push(`  ${why}`)
    return lines.join('\n')
  }
  lines.push('', `Written and verified. The old file is now ${applied.kept}.`)
  return lines.join('\n')
}

if (import.meta.main) {
  const from = oldFile()
  if (!existsSync(from)) {
    console.log(`There is no ${from}, so there is nothing to migrate.`)
    process.exit(0)
  }
  const plan = planFrom(JSON.parse(readFileSync(from, 'utf8')))
  const wanted = process.argv.includes('--apply')
  console.log(report(plan, wanted ? apply(plan, from) : null))
}
