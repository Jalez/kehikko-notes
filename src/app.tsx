import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ID } from '../manifest.ts'
import { saidOf, scopeOf } from '../notes/scope.ts'

import { Button } from '@/components/ui/button.tsx'
import { edit, look, type Anchored, type Ask, type Change, type Looked } from '@/store/ask.ts'
import { NoteRow, type NoteActions } from '@/view/note.tsx'
import { Listening, NoProject, Nowhere, Trouble } from '@/view/screens.tsx'
import { useRoadmap, type GotoHandler } from '@/wire/use-roadmap.ts'

/**
 * The page.
 *
 * ## What it shows, and the sentence that decides it
 *
 * > "Paper should provide information on what is being highlighted or selected,
 * > so that the notes module can be used to create notes on the selected item…
 * > Notes should show notes in a way that ensures specificity based on what is
 * > selected. For instance if nothing is selected but paper module shows a page,
 * > it should show all notes related to that page vs if only a part of the page
 * > is selected."
 *
 * So there is one screen and its scope is decided entirely by `context.passage`.
 * There is no picker here, no document list, no filter row — every one of those
 * would be a second answer to "what are we looking at" that could disagree with
 * the first. The pane follows.
 *
 * The one control that is not the reader pointing at something is `everything`,
 * and it exists because "nobody is pointing at anything" is an ordinary state
 * rather than a fault: a canvas with no paper on it, a reader who has closed
 * one, a project whose documents nothing is showing. A pane that could only
 * ever say so would be useless to somebody who wants to see what they wrote
 * yesterday, so there is one press that widens to the project. It is a press
 * and not a default, because a pane that silently showed everything would make
 * the narrowing above it meaningless.

 * ## And there is now one press that points the other way
 *
 * Pressing a note asks the host to point the canvas at the passage that note is
 * about. It is the one thing here that is not this pane following somebody, and
 * it is still somebody being followed — a person pressed a note, and a note is
 * a passage written down. Everything about which offsets are sent, and why they
 * are the anchor's rather than the note's, is on `point` in `actions` below.
 *
 * ## Identity is printed only when nothing is framing this page
 *
 * A host prints the module's name in the pane header and hangs the manifest's
 * `summary` off it as a tooltip. A page that also printed "Notes" at the top of
 * itself would be saying the name twice and spending a fixed strip of a
 * 340-pixel-tall pane on the repetition. Unframed there is no pane header, so
 * the heading stays — see `NoProject`, which is the only screen an unframed
 * page can reach now that a project's notes live in that project.
 */
export function App() {
  const [looked, setLooked] = useState<Looked | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [everything, setEverything] = useState(false)
  const [withResolved, setWithResolved] = useState(false)
  const [draft, setDraft] = useState('')
  const [round, setRound] = useState(0)
  /** Whether the notes this app has stopped lifting are on screen. One press. */
  const [showWithdrawn, setShowWithdrawn] = useState(false)

  const onGoto = useCallback<GotoHandler>((message, answer) => {
    /* A `goto` may name an epic, a step, or a reference. This pane draws notes
       against a place in a document, and none of those three is one — saying so
       quickly is what gets the reader the host's fallback link instead of a
       twelve-second wait. */
    answer(
      false,
      message.ref
        ? 'This pane shows notes anchored to passages of a document, so there is nothing here to walk to by reference.'
        : 'This pane shows notes on a document, so there is nothing here to walk to by epic or step.',
    )
  }, [])

  const { where, project, projectPath, passage, resize, point } = useRoadmap(ID, onGoto)

  /**
   * The scope, computed from the passage by the same function the server uses.
   *
   * One definition of the ladder, imported rather than restated — see
   * `notes/scope.ts`. The heading a reader sees and the heading an agent is
   * given at the door come from the same `saidOf`, so the two cannot describe
   * different lists to each other.
   */
  const scope = useMemo(() => scopeOf(passage), [passage])

  /*
   * A pointing reader clears the widened view.
   *
   * Without this, somebody who pressed "show every note" would stay widened
   * while they highlighted a sentence, and the pane would go on showing the
   * project while the reader watched their own selection do nothing. The press
   * is an answer to "nothing is pointing"; a passage arriving is that question
   * being answered better.
   */
  useEffect(() => {
    if (passage) setEverything(false)
  }, [passage])

  /*
   * No project, no question.
   *
   * `projectPath` is the address of the file this app would open — see
   * `store.ts` — so an ask without one is not a coarser question, it is a
   * question about no file at all. The page therefore builds no `Ask` until it
   * has a path, and `NoProject` is drawn instead. The type says so as well:
   * `Ask.projectPath` is not nullable, so this is the one place the null can be
   * dealt with and it cannot leak past here.
   *
   * `projectPath` is in the dependency list, so a reader moved to another
   * project on the same canvas gets a new `Ask`, a new fetch, and that
   * project's notes — live, with no reload. That is the whole reason the host
   * sends it on every context change rather than once at startup.
   */
  const ask: Ask | null = useMemo(() => {
    if (where === 'listening') return null
    if (!projectPath) return null
    if (everything) {
      return { project, projectPath, path: null, page: null, from: null, to: null, everything: true, resolved: withResolved }
    }
    if (!passage) return null
    return {
      project,
      projectPath,
      path: passage.path,
      page: passage.page,
      from: passage.from,
      to: passage.to,
      everything: false,
      resolved: withResolved,
    }
  }, [where, everything, passage, project, projectPath, withResolved])

  /*
   * Re-read on every change of scope, and after every write.
   *
   * Never patched in place. The server holds the notes AND resolves every
   * anchor against the file on disk, so a row this page assembled itself would
   * be a row with no anchor verdict on it — which is the one thing every row
   * here is for. `round` is what a write bumps.
   */
  useEffect(() => {
    if (!ask) {
      setLooked(null)
      return
    }
    let live = true
    void look(ask)
      .then((answer) => {
        if (!live) return
        if ('error' in answer) {
          setRefused(answer.error)
          setLooked(null)
        } else {
          setRefused(null)
          setLooked(answer)
        }
      })
      .catch(() => {
        if (live) setRefused('This app could not reach its own store.')
      })
    return () => {
      live = false
    }
  }, [ask, round])

  /*
   * Every write carries the project, taken from the context AT THE MOMENT OF
   * THE PRESS.
   *
   * Not from whatever the last read was against, which would be the same value
   * almost always and the wrong one exactly when it matters: a reader who moves
   * to another project while a reply box is open would post that reply into the
   * store they came from. `projectPath` is a dependency of this callback for
   * that reason, so a press always carries where the page is standing now.
   *
   * The guard is not defensive; it is the type. `Edit` requires a path, and
   * there is no screen with a press on it when there is no project — see
   * `NoProject` — so this can only be reached by a bug, and it refuses rather
   * than sending a request the door would have to refuse for it.
   */
  const write = useCallback(
    async (change: Change) => {
      if (!projectPath) {
        setRefused('Nothing has said which project this is, so there is nowhere to write.')
        return false
      }
      setBusy(true)
      const answer = await edit({ ...change, projectPath })
      setBusy(false)
      setRefused(answer.ok ? null : answer.error)
      setRound((was) => was + 1)
      return answer.ok
    },
    [projectPath],
  )

  const actions: NoteActions = useMemo(
    () => ({
      reply: (id, body) => void write({ op: 'reply', id, body }),
      resolve: (id, done) => void write({ op: 'resolve', id, done }),
      /*
       * Re-anchoring takes the offsets this app FOUND and the note's own words.
       *
       * The words are the note's rather than the file's on purpose: a `moved`
       * verdict means those exact words were located, so writing them back is
       * recording what was found, not asserting something new about the
       * document. The one thing this never does is re-anchor on its own — see
       * the essay in `notes/anchor.ts`.
       */
      reanchor: (one: Anchored) => {
        if (one.anchor.from === null || one.anchor.to === null) return
        void write({ op: 'reanchor', id: one.note.id, from: one.anchor.from, to: one.anchor.to, quoted: one.note.quoted })
      },
      /*
       * Pressing a note points the canvas at the passage it is about.
       *
       * ## The offsets are the ANCHOR's, and that is the whole of the care here
       *
       * A note holds where its passage was when it was written. The anchor holds
       * where those words are NOW, checked against the file a moment ago, and
       * the two differ on any document somebody is still editing. Sending the
       * recorded range would ask the paper to highlight whatever has since
       * drifted into those bytes — confidently, in a colour, with nothing on
       * screen able to say it is the wrong sentence. That is the exact failure
       * `notes/anchor.ts` exists to make visible, and it would be this pane
       * causing it in another module.
       *
       * So `moved` points at where the words actually are, `exact` at where they
       * always were, and `adrift` — where this app could not find them at all —
       * points at the DOCUMENT with no range, which is the honest amount of
       * precision left. `unranged` and `unverified` fall out of the same
       * expression for the same reason: the anchor is what this app is willing
       * to claim, and it is the only thing sent.
       *
       * The quote goes with it, always, because a consumer comparing the words
       * against the file can see a rotten range for itself — which is the
       * protocol's own argument for the field.
       */
      point: where === 'hosted'
        ? (one: Anchored) =>
            point({
              path: one.note.path,
              page: one.note.page,
              from: one.anchor.from,
              to: one.anchor.to,
              quoted: one.note.quoted.slice(0, 2000),
            })
        : null,
      busy,
    }),
    [write, busy, point, where],
  )

  /* How tall this page would like to be, asked for whenever what it draws
     changes. The host clamps it and may ignore it; that is the protocol. */
  const body = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const element = body.current
    if (!element) return
    resize(element.scrollHeight + 8)
  }, [resize, looked, refused, where])

  if (where === 'listening') return <Listening />
  /* Before every other screen, because it is the one that says there is no
     store at all. `Nowhere` offers a press that widens to the project, and
     offering it here would be offering to read a file that does not exist. */
  if (!projectPath) return <NoProject unhosted={where === 'unhosted'} />
  if (looked?.trouble) return <Trouble said={looked.trouble} />
  if (!ask) return <Nowhere project={project} onEverything={() => setEverything(true)} />

  const canWrite = !everything && scope.kind !== 'nowhere' && scope.kind !== 'everything'

  return (
    <div ref={body} className="min-w-0 space-y-2 p-2 @sm/pane:p-3">
      {/* What this pane is showing, in the words the door uses for the same
          scope. Never "Notes (3)" — a count is not a scope, and a reader who
          cannot see what was narrowed cannot tell narrowing from a bug. */}
      <p data-testid="scope" className="min-w-0 text-xs font-medium">
        {everything ? saidOf({ kind: 'everything' }) : (looked?.said ?? saidOf(scope))}
      </p>

      {refused ? (
        <p data-testid="refusal" className="min-w-0 text-xs text-adrift">
          {refused}
        </p>
      ) : null}

      {looked && !looked.verified && (looked.shown.length > 0 || looked.adrift.length > 0) ? (
        <p data-testid="unchecked" className="min-w-0 text-[0.7rem] text-muted-foreground">
          This app could not open any of these documents, so no anchor below has been checked. It is showing the words
          each note was written about, not the words that are there now.
        </p>
      ) : null}

      {canWrite ? (
        <form
          className="min-w-0 space-y-1"
          onSubmit={(event) => {
            event.preventDefault()
            if (!draft.trim() || !passage) return
            void write({
              op: 'add',
              path: passage.path,
              page: passage.page,
              from: passage.from,
              to: passage.to,
              quoted: passage.quoted,
              body: draft.trim(),
            }).then((ok) => {
              if (ok) setDraft('')
            })
          }}
        >
          {/* The passage this note will be anchored to, shown before it is
              written. A reader has to be able to see what they are about to
              attach a thought to — and it is prose, not a badge, because it is
              exactly the long unbroken string that widens a 220px pane. */}
          {passage?.quoted ? (
            <blockquote className="min-w-0 border-l-2 border-border pl-2 text-xs italic text-muted-foreground">
              {passage.quoted}
            </blockquote>
          ) : null}
          <textarea
            aria-label="Write a note about this"
            placeholder={
              scope.kind === 'passage' ? 'A note about this passage…' : 'A note about this page…'
            }
            className="min-h-16 w-full min-w-0 rounded border bg-background p-1.5 text-xs"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button size="pane" type="submit" disabled={busy || !draft.trim()}>
            write note
          </Button>
        </form>
      ) : null}

      {looked?.shown.length ? (
        <ul className="min-w-0">
          {looked.shown.map((one) => (
            <NoteRow key={one.note.id} one={one} actions={actions} />
          ))}
        </ul>
      ) : (
        <p data-testid="empty" className="min-w-0 text-xs text-muted-foreground">
          {looked?.adrift.length
            ? 'Nothing is anchored here.'
            : 'Nothing has been written here yet.'}
        </p>
      )}

      {/*
       * The adrift group, which is never filtered away by narrowing.
       *
       * A note whose passage has been rewritten cannot be placed by a range
       * test and must not be dropped by one. It is the most interesting note on
       * the document — the record of what somebody thought about a sentence that
       * has since changed — so it is shown at every scope, in a group of its own
       * so a reader can see it is a different kind of thing.
       */}
      {looked?.adrift.length ? (
        <section data-testid="adrift-group" className="min-w-0 space-y-1">
          <p className="min-w-0 text-xs font-medium text-adrift">
            {looked.adrift.length} note{looked.adrift.length === 1 ? '' : 's'} on this document cannot be placed in it
          </p>
          <ul className="min-w-0">
            {looked.adrift.map((one) => (
              <NoteRow key={one.note.id} one={one} actions={actions} />
            ))}
          </ul>
        </section>
      ) : null}

      {/*
       * The notes this app lifted under a rule it no longer applies.
       *
       * A line and a press, never rows by default. These are the ten notes that
       * came out of `main.tex`'s preamble — the build header, the font setup,
       * the four macros that DEFINE the note commands — and the user's complaint
       * was precisely that they were "mixed in with annotations about the
       * prose". Taking them out of the list is the fix; taking them out of the
       * ANSWER would be the filter `notes/scope.ts` spends a paragraph refusing,
       * because somebody who replied to one would find their reply gone with
       * nothing anywhere saying why.
       *
       * So: out of the way, one press from being read, and each one carries the
       * sentence saying what happened to it. Nothing was deleted and nothing
       * here could delete it.
       */}
      {looked?.withdrawn.length ? (
        <section data-testid="withdrawn-group" className="min-w-0 space-y-1">
          <p className="min-w-0 text-[0.7rem] text-muted-foreground">
            {looked.withdrawn.length} note{looked.withdrawn.length === 1 ? '' : 's'} here came out of this file
            {"\u2019"}s build rather than its argument, and {looked.withdrawn.length === 1 ? 'is' : 'are'} no longer
            read as annotation.
          </p>
          <Button size="pane" variant="ghost" onClick={() => setShowWithdrawn((was) => !was)}>
            {showWithdrawn ? 'hide them' : 'show them'}
          </Button>
          {showWithdrawn ? (
            <ul className="min-w-0">
              {looked.withdrawn.map((one) => (
                <NoteRow key={one.note.id} one={one} actions={actions} />
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {looked?.elsewhere ? (
        <p data-testid="elsewhere" className="min-w-0 text-[0.7rem] text-muted-foreground">
          {looked.elsewhere} more note{looked.elsewhere === 1 ? ' is' : 's are'} on this document, outside what is
          selected.
        </p>
      ) : null}

      <div className="flex min-w-0 flex-wrap gap-1">
        <Button size="pane" variant="ghost" onClick={() => setWithResolved((was) => !was)}>
          {withResolved ? 'hide resolved' : 'show resolved'}
        </Button>
        {passage ? (
          <Button size="pane" variant="ghost" onClick={() => setEverything((was) => !was)}>
            {everything ? 'follow the reader' : 'every note in this project'}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
