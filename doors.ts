import { KEHIKOT_DIR, moduleFolder } from 'roadmap-module-protocol'

import { ID, MANIFEST, VERSION } from './manifest.ts'
import { FILE } from './store.ts'
import { resolveAll, type Anchored } from './notes/anchor.ts'
import { change, count, howMany, notesOf, str, type Op } from './notes/keep.ts'
import { narrow, pathOf, saidOf, scopeOf, type Narrowed, type Scope } from './notes/scope.ts'
import { MAX_BODY, MAX_BY, MAX_ID, MAX_PATH, MAX_QUOTE, sourceOf } from './notes/shape.ts'
import { forgetReads, ingestSource } from './notes/ingest.ts'
import { readerFor } from './notes/source.ts'

/**
 * Every door this app answers on that is not the page itself.
 *
 * ## Why this is a file of functions rather than a server
 *
 * A module is ONE ORIGIN or it is nothing. The protocol refuses a manifest
 * whose `entry` points anywhere but the origin that served the manifest, and it
 * is right to — a program that could name somebody else's page would be a
 * program that could have the host frame somebody else. The page is served by
 * Vite, because a `dist/` served off disk has cost this codebase whole
 * afternoons of a stale page answering 200 with every symptom of a working app
 * and none of the changes. So the manifest, the health check, the MCP door and
 * this app's own store have to be Vite's too — they cannot be a second process
 * on a second port however much tidier that would look.
 *
 * Hence: no listener here. `answer()` takes a method, a path, a query and a
 * body and returns a status and a document, and `vite.config.ts` adapts a node
 * request to it in a dozen lines.
 *
 * ## Nothing here trusts its caller
 *
 * The page is one caller, an agent over MCP is another, and a third is whatever
 * else on this machine found the port — this listens on loopback, which is a
 * fence around the machine and not around the programs on it. Every string is
 * bounded before it is looked at and every number is refused rather than
 * defaulted. The rules about what a note may BE live one layer down in
 * `notes/keep.ts`, so the page and this door cannot tell somebody two different
 * things about the same press.
 */

/**
 * The ticket a write has to carry.
 *
 * Minted once per process and printed into the page this server serves. It dies
 * with this process, because a secret that outlives the thing that issued it is
 * one nobody can revoke by restarting.
 *
 * What it separates is "this app's own page pressed something" from "something
 * else on this machine guessed the port and posted". This module declares
 * `storage: true` and sets no `server.cors`, which is what makes the separation
 * real rather than decorative: the page has an origin of its own, its fetches
 * are same-origin, no CORS header is offered to anybody, and `/app` — and
 * therefore this string — is unreadable from another origin.
 *
 * Reads are not gated on it. A note is not a secret from anything that could
 * already open the page, and gating reads would only mean an agent's curl needs
 * a ticket to look at what `/mcp` hands over anyway.
 */
export const TICKET = crypto.randomUUID()

/** The word a note is filed under when the page wrote it. */
const OWNER = 'the owner, on this app’s own page'

/** What an agent is called when it does not say. */
const AGENT = process.env.NOTES_AGENT ?? process.env.ROADMAP_AGENT ?? 'an agent'

/**
 * The byline on a note this app lifted out of a document.
 *
 * Not a person and not an agent, and it says so in words rather than leaving a
 * reader to work it out from a badge. Whoever wrote the `\todo{}` wrote it in
 * their own file; nobody typed it here, and a derived note filed under "the
 * owner" or under an agent's name would be this app claiming somebody said
 * something in a place they did not say it. The same rule `viaMcp` exists for:
 * a reader who cannot tell two kinds of claim apart believes both equally.
 */
const AUTHOR = 'the author, in the source'

/* ------------------------------------------------------------------ *
 * Reading: a project, a scope, and the anchors resolved against disk
 * ------------------------------------------------------------------ */

/**
 * How a caller says which project it means, written once because four tools
 * would otherwise say it four slightly different ways.
 *
 * ## One field now, and it is required rather than merely helpful
 *
 * There used to be two — `project`, the name, and `projectPath`, the folder —
 * because the store partitioned on the pair. It does not any more: a project's
 * notes live in `<projectPath>/.kehikot/notes/notes.json`, so the folder is not a
 * hint about which pile to filter, it is the ADDRESS OF THE FILE. A name cannot
 * address a file, so `project` is gone rather than deprecated: nothing here
 * stores it and nothing reads it, and leaving it in the schema would invite an
 * agent to send the one argument that no longer does anything.
 *
 * And the path is REQUIRED, where sending neither field used to be a legitimate
 * question about the pile of notes nobody had attributed to a project. There is
 * no such pile now, because there is no file that could hold one. So a call
 * without a path is a call this app cannot answer, and every default it might
 * invent is wrong in a different way:
 *
 * - `process.cwd()` is THIS module's own directory. Notes would be filed under
 *   `/Users/…/kehikko-notes` and no pane would ever show one.
 * - "wherever the last person was looking" is state this app deliberately does
 *   not keep, and would mean an agent's notes landing in whichever project
 *   somebody else happened to be standing in.
 * - Nowhere at all is notes going somewhere to be invisible.
 *
 * So it is refused, in a sentence that names the argument to send. An agent
 * being asked about a document already knows which project that document is in.
 */
const PROJECT_PROPERTIES = {
  projectPath: {
    type: 'string',
    description:
      'The absolute directory the project lives in. Required. Notes are kept inside the project they are about, at '
      + '<projectPath>/.kehikot/notes/notes.json, so this names the file to open — an address, not a filter — and there is '
      + 'no answer without it.',
  },
} as const

const PLACE_PROPERTIES = {
  path: {
    type: 'string',
    description:
      'The document, as an absolute path. Notes are anchored to a file and this is the file. Omit it, with '
      + 'everything: true, to see the whole project.',
  },
  page: {
    type: 'integer',
    description:
      'Which page of it, counting from 1. A filter and not an anchor: page numbers move when anything above them '
      + 'is edited, so this narrows a list and never decides what a note is about.',
  },
  from: {
    type: 'integer',
    description: 'First byte of the passage within the document. Give both ends or neither.',
  },
  to: { type: 'integer', description: 'One past the last byte of the passage. Give both ends or neither.' },
} as const

interface Asked {
  projectPath: string
  scope: Scope
  everything: boolean
}

/**
 * The refusal for a call that did not say which project, in one place.
 *
 * At the door rather than in the store, because the store's own `NOWHERE`
 * addresses the page — "open a project on this canvas" — and this addresses an
 * agent, which has an argument to send instead. Two audiences, two sentences,
 * and each one names the remedy the reader actually has.
 */
const NO_PROJECT =
  'That did not say which project. Notes live inside the project they are about, at '
  + '<projectPath>/.kehikot/notes/notes.json, so projectPath is the address of the file to open and there is no answer '
  + 'without it. This app will not guess: every folder it could pick is one where a note would be written and never '
  + 'seen again. Send the absolute directory of the project the document is in.'

/**
 * What a caller asked to see, or a sentence saying why that was not a question.
 *
 * The scope comes from the same `scopeOf` the page uses over the same four
 * fields, so an agent asking "what is on page 7" and a reader looking at page 7
 * are answered from one definition of what that means.
 *
 * The project is checked FIRST, before the scope, because it is the one refusal
 * that is about where rather than about what: telling somebody their range is
 * malformed when the real problem is that no project was named would send them
 * to fix the wrong argument.
 */
function asked(args: Record<string, unknown>): Asked | string {
  const projectPath = str(args.projectPath, MAX_PATH)
  if (!projectPath) return NO_PROJECT
  const everything = args.everything === true || args.everything === 'true'
  const path = str(args.path, MAX_PATH)

  if (everything || !path) {
    if (!everything) {
      return (
        'That did not say which document. Notes are anchored to a file, so a request without one has no scope — '
        + 'give path, or everything: true to see the whole project at once.'
      )
    }
    return { projectPath, scope: { kind: 'everything' }, everything: true }
  }

  const page = args.page === undefined || args.page === null || args.page === '' ? null : count(args.page)
  if (args.page !== undefined && args.page !== null && args.page !== '' && (page === null || page < 1)) {
    return 'A page is a whole number counting from 1, or is left out entirely. Nothing was read.'
  }

  const gaveFrom = args.from !== undefined && args.from !== null && args.from !== ''
  const gaveTo = args.to !== undefined && args.to !== null && args.to !== ''
  if (gaveFrom !== gaveTo) {
    return (
      'A passage names both ends or neither. Half a range is not a coarser question — it is one whose missing end '
      + 'would have to be invented. Omit both to ask about the whole page.'
    )
  }
  const from = gaveFrom ? count(args.from) : null
  const to = gaveTo ? count(args.to) : null
  if (gaveFrom && (from === null || to === null)) return 'A passage is named in whole numbers of bytes. Nothing was read.'
  if (from !== null && from < 0) return 'A passage starts at or after byte 0. Nothing was read.'
  if (from !== null && to !== null && to <= from) return 'A passage ends after it starts. Nothing was read.'

  return {
    projectPath,
    scope: scopeOf({ path, page, from, to, quoted: '' }),
    everything: false,
  }
}

export interface Looked {
  narrowed: Narrowed
  said: string
  trouble: string | null
  /** Whether this app was able to open any document at all. See `notes/source.ts`. */
  verified: boolean
}

/**
 * One screen's worth of notes: one project's store, resolved against disk,
 * narrowed to the scope.
 *
 * The steps are in this order for a reason. The project decides which FILE is
 * opened, so no other project's notes are ever in hand to be filtered wrongly
 * and no other project's document is ever opened. Resolving before narrowing
 * means the range test runs against where a note points NOW, so an edit above
 * the reader does not empty the pane — and means a note whose anchor is gone is
 * known to be gone before anything decides whether to show it.
 */
export function look(asked: Asked, includeResolved: boolean): Looked {
  /**
   * The author's own annotations, read out of the document first.
   *
   * Before the notes are fetched rather than after, so that a `\todo{}` added
   * to a chapter this morning is in the list somebody is about to be shown
   * instead of appearing on the read after next.
   *
   * Only when the scope names a FILE. Asking for everything in a project reads
   * no files at all, so no amount of browsing scans a tree, and a repeat read
   * of an unchanged file does nothing — see `ingestSource`, which holds what it
   * has already seen. The reader is the same confined one used to verify
   * anchors, so a path outside every root is silence here exactly as it is
   * there.
   *
   * The whole argument for a write happening on a read is in `notes/ingest.ts`.
   * The short version: the alternative is a person pressing a button to be
   * shown information the program already has, and a press that would never
   * mean no.
   */
  const path = pathOf(asked.scope)
  const read = readerFor(asked.projectPath)
  if (path) {
    ingestSource({ projectPath: asked.projectPath, path }, read, AUTHOR)
  }

  const { notes, trouble } = notesOf(asked.projectPath)
  const wanted = includeResolved ? notes : notes.filter((one) => !one.resolved)
  const anchored = resolveAll(wanted, read)
  const verified = anchored.some((one) => one.anchor.state === 'exact' || one.anchor.state === 'moved' || one.anchor.state === 'adrift')
  return { narrowed: narrow(anchored, asked.scope), said: saidOf(asked.scope), trouble, verified }
}

/* ------------------------------------------------------------------ *
 * The agent's door
 * ------------------------------------------------------------------ */

/**
 * The five tools, which are the whole of what an agent can do here.
 *
 * Streamable HTTP, one request one answer — no sessions and no stream, because
 * nothing here pushes.
 *
 * ## What is NOT here
 *
 * There is no `forget_note`. Deleting a note removes the reason a sentence was
 * changed along with the note, and it is the one irreversible act this app
 * could offer. `resolve_note` is what "this is dealt with" means, it is
 * reversible, and it keeps the record. An agent that wants a note gone can say
 * so and be told no by somebody.
 *
 * There is no tool that returns the contents of a document either, and that is
 * a boundary rather than an omission — see `notes/source.ts`. This app opens a
 * file to check an anchor and answers with a verdict. A tool that answered
 * "what is at bytes 400–460" would make this a file-reading service on loopback
 * with a notes app bolted to it.
 */
function tools() {
  return [
    {
      name: 'notes',
      description:
        'What has been written against a document, narrowed to where you are looking. Give path for the whole file, '
        + 'add page for one page of it, or add from and to for one passage — the same ladder the pane uses, so you '
        + 'and whoever is reading see the same list. Every note comes back with whether its anchor still points at '
        + 'the words it was written about: MOVED means the offsets rotted and the words are still there, ADRIFT '
        + 'means the passage is gone. Read this before editing a file; a note you did not read is a note you are '
        + 'about to overwrite the reason for.',
      inputSchema: {
        type: 'object',
        properties: {
          ...PROJECT_PROPERTIES,
          ...PLACE_PROPERTIES,
          everything: { type: 'boolean', description: 'Every note in the project, ignoring path, page and range.' },
          include_resolved: { type: 'boolean', description: 'Show notes somebody has already closed. Defaults to false.' },
        },
        required: ['projectPath'],
      },
    },
    {
      name: 'add_note',
      description:
        'Write a note against a passage of a document. ALWAYS send quoted: the exact text of the passage as it '
        + 'reads right now. Byte offsets rot the moment anybody edits above them and nothing in a pair of numbers '
        + 'can notice; the quote is the only thing that later tells a live anchor from one silently pointing at the '
        + 'wrong sentence. Omit from and to — and the quote with them — to write a note about a whole page.',
      inputSchema: {
        type: 'object',
        properties: {
          ...PROJECT_PROPERTIES,
          ...PLACE_PROPERTIES,
          quoted: { type: 'string', description: `The passage, verbatim. Required with from and to. Up to ${MAX_QUOTE} characters.` },
          body: { type: 'string', description: `What you have to say about it. Up to ${MAX_BODY} characters.` },
          agent: { type: 'string', description: 'Your own name, so the note says who wrote it' },
        },
        required: ['projectPath', 'path', 'body'],
      },
    },
    {
      name: 'reply_to_note',
      description:
        'Answer one note. This is where you say what you did about it, or why you did not — a reply is addressed to '
        + 'whoever wrote the note and is read by whoever edits next. It does not close anything; resolve_note does '
        + 'that.',
      inputSchema: {
        type: 'object',
        properties: {
          ...PROJECT_PROPERTIES,
          note: { type: 'string', description: 'The note id, as the notes tool prints it' },
          body: { type: 'string', description: `What you have to say. Up to ${MAX_BODY} characters.` },
          agent: { type: 'string' },
        },
        required: ['projectPath', 'note', 'body'],
      },
    },
    {
      name: 'resolve_note',
      description:
        'Mark one note dealt with, or reopen it with done: false. Resolve what you have actually done, and reply '
        + 'first saying what that was — a note closed with no account of what happened is worse than one left open. '
        + 'Nothing is deleted: a resolved note is one press from being read again, because the reason a sentence '
        + 'changed outlives the change.',
      inputSchema: {
        type: 'object',
        properties: {
          ...PROJECT_PROPERTIES,
          note: { type: 'string', description: 'The note id' },
          done: { type: 'boolean', description: 'Defaults to true' },
          agent: { type: 'string' },
        },
        required: ['projectPath', 'note'],
      },
    },
    {
      name: 'reanchor_note',
      description:
        'Move a note whose offsets have drifted onto where its passage actually is now, and say what is there in '
        + 'its own words. Only for a note the notes tool reports as MOVED or ADRIFT. This app never does it on your '
        + 'behalf: silently rewriting somebody’s record to match a file a program guessed about is the same class '
        + 'of mistake as attaching their note to the wrong sentence, and unrecoverable rather than visible.',
      inputSchema: {
        type: 'object',
        properties: {
          ...PROJECT_PROPERTIES,
          note: { type: 'string', description: 'The note id' },
          from: { type: 'integer', description: 'First byte of the passage now' },
          to: { type: 'integer', description: 'One past the last byte of it now' },
          quoted: { type: 'string', description: 'What is at that range now, verbatim' },
          agent: { type: 'string' },
        },
        required: ['projectPath', 'note', 'from', 'to', 'quoted'],
      },
    },
    {
      name: 'read_source_notes',
      description:
        'Read one document again and lift the author’s own annotations out of it — every \\todo{}, \\missing{}, '
        + '\\alt{}, \\thought{} and \\attention{} macro, and every run of % comment lines — into notes anchored '
        + 'where they sit in the file. Safe to call repeatedly: an annotation is identified by a hash of its WORDS, '
        + 'so reading a chapter twice produces one note and not two. Nothing is ever deleted — an annotation you have '
        + 'removed from the file is marked as no longer in the source and kept, with whatever was said about it. Call '
        + 'this after editing a .tex if you want the pane to catch up immediately; it happens on its own whenever '
        + 'somebody looks at notes for a document.',
      inputSchema: {
        type: 'object',
        properties: {
          ...PROJECT_PROPERTIES,
          path: { type: 'string', description: 'Absolute path of the .tex file to read' },
        },
        required: ['projectPath', 'path'],
      },
    },
  ]
}

/* ------------------------------------------------------------------ *
 * The answers, in words
 * ------------------------------------------------------------------ */

const MARKS: Record<string, string> = {
  exact: '',
  moved: ' [MOVED]',
  adrift: ' [ADRIFT]',
  unverified: ' [UNCHECKED]',
  unranged: ' [whole page]',
}

function noteText(one: Anchored): string {
  const { note, anchor } = one
  const where =
    anchor.from === null
      ? note.page === null
        ? note.path
        : `${note.path}, page ${note.page}`
      : `${note.path} bytes ${anchor.from}–${anchor.to}`
  /* Where a note came FROM, on the line an agent reads first.
     A `\todo{}` the author left in their own .tex and a thought somebody typed
     into the pane are different claims — one is a task list the author keeps in
     a file they will edit, the other is a conversation — and an agent that
     cannot tell them apart will answer both the same way. `[GONE FROM SOURCE]`
     is the other half: the annotation has left the file, the note has not, and
     an agent should read it as history rather than as work outstanding. */
  const source = sourceOf(note)
  const provenance = source
    ? source.present
      ? ` [from the ${source.kind === 'todo' ? 'source macro' : 'source comment'}]`
      : ' [GONE FROM SOURCE]'
    : ''
  const lines = [
    `${note.id}${MARKS[anchor.state] ?? ''}${provenance} — ${where}`,
    `  by ${note.by}${note.viaMcp ? ', over MCP' : ''} at ${note.at}${note.resolved ? `, resolved by ${note.resolvedBy}` : ''}`,
    note.quoted ? `  quoting: “${note.quoted.slice(0, 300)}${note.quoted.length > 300 ? '…' : ''}”` : '',
    `  anchor: ${anchor.said}`,
    `  ${note.body}`,
  ].filter(Boolean)
  for (const reply of note.replies) {
    lines.push(`    ↳ ${reply.by}${reply.viaMcp ? ', over MCP' : ''}: ${reply.body}`)
  }
  return lines.join('\n')
}

function lookText(looked: Looked): string {
  if (looked.trouble) return looked.trouble
  const { narrowed } = looked
  const head = [looked.said]
  if (!narrowed.shown.length && !narrowed.adrift.length) {
    head.push(
      narrowed.elsewhere
        ? `Nothing here. ${narrowed.elsewhere} note${narrowed.elsewhere === 1 ? '' : 's'} on this document `
          + 'fall outside what you asked about — widen the range or drop it to see them.'
        : 'Nothing has been written here yet. add_note writes the first.',
    )
    return head.join('\n')
  }
  if (narrowed.shown.length) {
    head.push('', ...narrowed.shown.map(noteText))
  }
  if (narrowed.adrift.length) {
    head.push(
      '',
      `${narrowed.adrift.length} note${narrowed.adrift.length === 1 ? '' : 's'} on this document cannot be placed in `
      + `it, and ${narrowed.adrift.length === 1 ? 'is' : 'are'} shown at every scope rather than filtered away:`,
      ...narrowed.adrift.map(noteText),
    )
  }
  if (narrowed.elsewhere) {
    head.push(
      '',
      `${narrowed.elsewhere} more note${narrowed.elsewhere === 1 ? ' is' : 's are'} on this document outside what you `
      + 'asked about.',
    )
  }
  /* Said as a count and a reason rather than as rows. These are notes this app
     lifted under a rule it no longer applies, and an agent reading them as
     outstanding work on the paper would be acting on a font setup. Nothing is
     deleted and they are still addressable by id, which is why the sentence
     names the number rather than pretending they are not there. */
  if (narrowed.withdrawn.length) {
    const one = narrowed.withdrawn.length === 1
    head.push(
      '',
      `${narrowed.withdrawn.length} note${one ? ' was' : 's were'} lifted out of this file under a rule this app no `
      + `longer applies, so ${one ? 'it is' : 'they are'} not listed above. `
      + (sourceOf(narrowed.withdrawn[0]!.note)?.withdrawn ?? ''),
    )
  }
  if (!looked.verified) {
    head.push(
      '',
      'This app could not open any of these documents, so no anchor above has been checked. It is showing the words '
      + 'each note was written about, not the words that are there now. Set NOTES_ROOTS to a directory it may read.',
    )
  }
  return head.join('\n')
}

/**
 * Every write, bounded and then handed to the one function that decides.
 *
 * The bounds are here and the rules are in `notes/keep.ts`. The refusal sentence
 * always comes from the store, so the page and this door cannot end up telling
 * somebody two different things about the same press.
 */
function call(name: string, args: Record<string, unknown>): string {
  const by = str(args.agent, MAX_BY) || AGENT

  if (name === 'notes') {
    const ask = asked(args)
    if (typeof ask === 'string') throw new Error(ask)
    return lookText(look(ask, args.include_resolved === true))
  }

  if (name === 'add_note') {
    const ask = asked({ ...args, everything: false })
    if (typeof ask === 'string') throw new Error(ask)
    if (ask.scope.kind === 'everything' || ask.scope.kind === 'nowhere') {
      throw new Error('add_note needs the document the note is about. A note with no anchor is a thought with nowhere to go back to.')
    }
    const scope = ask.scope
    const op: Op = {
      op: 'add',
      path: scope.path,
      page: scope.kind === 'page' ? scope.page : scope.kind === 'passage' ? scope.page : null,
      from: scope.kind === 'passage' ? scope.from : null,
      to: scope.kind === 'passage' ? scope.to : null,
      quoted: str(args.quoted, MAX_QUOTE),
      body: str(args.body, MAX_BODY),
      by,
      viaMcp: true,
    }
    const out = change(ask.projectPath, op)
    if (!out.ok) throw new Error(out.error)
    return `${out.said}, as ${out.id}.\n\n${lookText(look(ask, false))}`
  }

  if (name === 'read_source_notes') {
    const projectPath = str(args.projectPath, MAX_PATH)
    if (!projectPath) throw new Error(NO_PROJECT)
    const path = str(args.path, MAX_PATH)
    if (!path) throw new Error('read_source_notes needs the absolute path of the document to read.')
    /* `force`, because a tool call means "again, now". The guard that skips an
       unchanged file is there so that a person scrolling does not cause work;
       an agent that has just edited the file and is asking explicitly has told
       this app more than the file's length can. */
    forgetReads()
    const done = ingestSource({ projectPath, path }, readerFor(projectPath), AUTHOR, true)
    if (done.said === null) {
      throw new Error(
        `This app could not open ${path}. It reads only inside the roots it was started with — NOTES_ROOTS, or the `
        + 'project path the host named — so a document outside them is not refused, it is invisible. Nothing was '
        + 'changed.',
      )
    }
    const ask = asked({ projectPath, path })
    if (typeof ask === 'string') throw new Error(ask)
    return `${done.said}\n\n${lookText(look(ask, false))}`
  }

  /* The three tools that address an existing note by id. They need the project
     too, and that is new: an id names a note INSIDE one project's file, so
     without the path there is no file to look in. It was possible before only
     because there was one file holding everybody's notes — which is exactly the
     arrangement this change removed. */
  const projectPath = str(args.projectPath, MAX_PATH)
  if (!projectPath) throw new Error(NO_PROJECT)

  const id = str(args.note, MAX_ID)
  if (!id) {
    throw new Error(
      `${name} needs the id of the note, which the notes tool prints at the start of each one. It is not the note's `
      + 'words and it is not its position — both of those move, and an id does not.',
    )
  }

  if (name === 'reply_to_note') {
    const out = change(projectPath, { op: 'reply', id, body: str(args.body, MAX_BODY), by, viaMcp: true })
    if (!out.ok) throw new Error(out.error)
    return out.said
  }

  if (name === 'resolve_note') {
    const out = change(projectPath, { op: 'resolve', id, done: args.done !== false, by, viaMcp: true })
    if (!out.ok) throw new Error(out.error)
    return out.said
  }

  /* reanchor_note, and the only tool that changes what a note is about. */
  const from = count(args.from)
  const to = count(args.to)
  if (from === null || to === null) {
    throw new Error(
      'reanchor_note needs from and to: whole numbers of bytes saying where the passage is NOW. Without both, this '
      + 'would be moving a note to a place nobody named. Nothing was moved.',
    )
  }
  const out = change(projectPath, { op: 'reanchor', id, from, to, quoted: str(args.quoted, MAX_QUOTE), by, viaMcp: true })
  if (!out.ok) throw new Error(out.error)
  return out.said
}

/** A status and a document. Nothing here writes bytes; the adapter does that. */
export interface Reply {
  status: number
  /** `null` means "answer with no body", which is what a notification gets. */
  body: unknown
}

const ok = (body: unknown): Reply => ({ status: 200, body })
const bad = (why: string, status = 400): Reply => ({ status, body: { ok: false, error: why } })

interface Rpc {
  id?: number | string
  method?: string
  params?: { name?: string; arguments?: Record<string, unknown> }
}

const TOOL_NAMES = ['notes', 'add_note', 'reply_to_note', 'resolve_note', 'reanchor_note', 'read_source_notes']

function mcp(rpc: Rpc): Reply {
  const reply = (result: unknown) => ok({ jsonrpc: '2.0', id: rpc.id ?? null, result })
  const text = (s: string, isError = false) =>
    reply({ content: [{ type: 'text', text: s }], ...(isError ? { isError } : {}) })

  if (rpc.method === 'initialize') {
    return reply({
      protocolVersion: '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: ID, version: VERSION },
      instructions:
        'Notes anchored to passages of documents: a file, a page, a byte range, and the words that were there when '
        + 'the note was written. Every read says whether each anchor still holds — MOVED when the offsets rotted and '
        + 'the words are still in the file, ADRIFT when the passage is gone. Nothing is ever silently re-anchored '
        + 'and nothing is ever deleted.',
    })
  }
  /* A notification carries no id and is answered with nothing. */
  if (typeof rpc.method === 'string' && rpc.method.startsWith('notifications/')) {
    return { status: 202, body: null }
  }
  if (rpc.method === 'tools/list') return reply({ tools: tools() })

  if (rpc.method === 'tools/call') {
    const name = String(rpc.params?.name ?? '')
    const args = (rpc.params?.arguments ?? {}) as Record<string, unknown>
    try {
      if (TOOL_NAMES.includes(name)) return text(call(name, args))
    } catch (e) {
      /* A refusal is an answer, and the sentence is the useful half — every one
         of them names what to do instead. So it comes back as a tool error the
         agent reads, not as a transport failure it retries. */
      return text(e instanceof Error ? e.message : String(e), true)
    }
    const shown = name.length > 60 ? `${name.slice(0, 60)}…` : name
    return text(`no tool "${shown}" here`, true)
  }

  return {
    status: 404,
    body: { jsonrpc: '2.0', id: rpc.id ?? null, error: { code: -32601, message: String(rpc.method) } },
  }
}

/**
 * Every door but the page, as one function.
 *
 * `null` means "this path is not ours", and the caller passes it on to Vite —
 * which is how the page, the client module and Vite's own hot-reload socket keep
 * working without being enumerated here.
 */
export function answer(
  method: string,
  path: string,
  query: URLSearchParams,
  body: Record<string, unknown> | null,
  ticket: string | null,
): Reply | null {
  /*
   * The health check, which can only count when it is told where to look.
   *
   * It used to answer `notes: <total>` off the one store beside this program.
   * There is no such total any more — the notes are in the projects, one file
   * each — and a health check is usually a GET from whoever started this app
   * rather than from a canvas, so nothing has said which project it means.
   *
   * The honest shape is therefore two answers. Given `projectPath`, it opens
   * that project's store and reports the count and any trouble reading it,
   * which is exactly what it always did and is the useful thing to monitor.
   * Given nothing, `notes` is null and `where` says where notes live at all,
   * so a person reading the response knows where to go and look. What it never
   * does is scan for stores belonging to projects nobody asked about, or print
   * a zero that means "I did not look".
   *
   * `ok` stays what it always was: false only when a store that was asked for
   * could not be read. A health check that went red because nobody had named a
   * project would be reporting an ordinary state as a fault.
   */
  if (path === '/healthz') {
    const asked = query.get('projectPath')
    const { total, trouble, nowhere } = howMany(asked)
    return ok({
      ok: !trouble,
      id: ID,
      version: VERSION,
      notes: nowhere ? null : total,
      where: `<project>/${KEHIKOT_DIR}/${moduleFolder(ID)}/${FILE}.json`,
      ...(trouble ? { trouble } : {}),
    })
  }

  if (path === '/mcp') {
    if (method !== 'POST') return bad('the MCP door takes POST', 405)
    if (!body || typeof body.method !== 'string') {
      return { status: 400, body: { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'not a request' } } }
    }
    return mcp(body as Rpc)
  }

  /*
   * One screen's worth of notes.
   *
   * The passage rides in the query rather than the path because it has four
   * parts and a path would have to encode them into one, which is exactly the
   * ambiguity the ladder is built to avoid. Reads are ungated like every other
   * read here; a note is not a secret from anything that could open the page.
   */
  if (path === '/api/notes' && method === 'GET') {
    const ask = asked({
      projectPath: query.get('projectPath'),
      path: query.get('path'),
      page: query.get('page'),
      from: query.get('from'),
      to: query.get('to'),
      everything: query.get('everything') === '1',
    })
    if (typeof ask === 'string') return bad(ask)
    const looked = look(ask, query.get('resolved') === '1')
    return ok({
      ok: true,
      said: looked.said,
      scope: looked.narrowed.scope,
      shown: looked.narrowed.shown,
      adrift: looked.narrowed.adrift,
      elsewhere: looked.narrowed.elsewhere,
      withdrawn: looked.narrowed.withdrawn,
      verified: looked.verified,
      trouble: looked.trouble,
    })
  }

  if (method === 'POST' && path.startsWith('/api/')) {
    /* The gate on every write, and it is one line because the whole argument for
       it is in `TICKET` above. An agent's door is `/mcp` and is deliberately
       above this check: an MCP client is not a browser, has no page to have been
       handed a ticket, and requiring one there would mean the door could never
       be opened by the thing it exists for. */
    if (ticket !== TICKET) return bad('that press did not come from this app’s own page', 403)
    if (!body) return bad('that was not a request')

    if (path === '/api/note') {
      const op = str(body.op, 16)
      const by = OWNER

      /* Which project, on EVERY write and not only on `add`. The page sends
         `context.projectPath` with each press, because the id of a note is only
         an address inside one project's file — and because the reader may have
         moved to another project between the read that drew the row and the
         press on it. Taken from this request rather than remembered from the
         last one for exactly that reason. */
      const projectPath = str(body.projectPath, MAX_PATH) || null

      if (op === 'add') {
        const from = body.from === null || body.from === undefined ? null : count(body.from)
        const to = body.to === null || body.to === undefined ? null : count(body.to)
        return ok(
          change(projectPath, {
            op: 'add',
            path: str(body.path, MAX_PATH),
            page: body.page === null || body.page === undefined ? null : count(body.page),
            from,
            to,
            quoted: str(body.quoted, MAX_QUOTE),
            body: str(body.body, MAX_BODY),
            by,
          }),
        )
      }

      const id = str(body.id, MAX_ID)
      if (!id) return bad('that change did not say which note it was about.')
      if (op === 'reply') return ok(change(projectPath, { op: 'reply', id, body: str(body.body, MAX_BODY), by }))
      if (op === 'resolve') return ok(change(projectPath, { op: 'resolve', id, done: body.done !== false, by }))
      if (op === 'reanchor') {
        const from = count(body.from)
        const to = count(body.to)
        if (from === null || to === null) {
          return bad('a re-anchor needs both ends of where the passage is now, and nothing was moved.')
        }
        return ok(change(projectPath, { op: 'reanchor', id, from, to, quoted: str(body.quoted, MAX_QUOTE), by }))
      }
      /* Named rather than shrugged at, because the page and this store are one
         program: an op this door does not know is this app's own bug and the
         next person to read a log is the one who has to find it. */
      return bad(`there is no "${op}" to do to a note — it is add, reply, resolve or reanchor.`)
    }
  }

  /* An unknown path under `/api/` is ours to refuse rather than Vite's to try
     and serve as a source file. Anything else is not ours at all. */
  if (path.startsWith('/api/')) return bad('not here', 404)
  return null
}

export { MANIFEST }
