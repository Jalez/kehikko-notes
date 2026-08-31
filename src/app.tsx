import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ID } from '../manifest.ts'
import { keyOf, shownAt as heldAt, standing, type Pointed } from '../notes/pointed.ts'
import { briefOf, fileOf, scopeOf, type Scope } from '../notes/scope.ts'

import { snappable } from '../notes/room.ts'

import { Button } from '@/components/ui/button.tsx'
import { edit, look, type Anchored, type Ask, type Change, type Looked } from '@/store/ask.ts'
import { Compose } from '@/view/compose.tsx'
import { NoteRow, type NoteActions } from '@/view/note.tsx'
import { useRoom } from '@/view/room.ts'
import { Listening, NoProject, Nowhere, Trouble } from '@/view/screens.tsx'
import { useRoadmap, type GotoHandler, type Passage } from '@/wire/use-roadmap.ts'

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
 * the first. The container follows.
 *
 * The one control that is not the reader pointing at something is `everything`,
 * and it exists because "nobody is pointing at anything" is an ordinary state
 * rather than a fault: a canvas with no paper on it, a reader who has closed
 * one, a project whose documents nothing is showing. A container that could only
 * ever say so would be useless to somebody who wants to see what they wrote
 * yesterday, so there is one press that widens to the project. It is a press
 * and not a default, because a container that silently showed everything would make
 * the narrowing above it meaningless.

 * ## And there is now one press that points the other way
 *
 * Pressing a note asks the host to point the canvas at the passage that note is
 * about. It is the one thing here that is not this container following somebody, and
 * it is still somebody being followed — a person pressed a note, and a note is
 * a passage written down. Everything about which offsets are sent, and why they
 * are the anchor's rather than the note's, is on `point` in `actions` below.
 *
 * ## Identity is printed only when nothing is framing this page
 *
 * A host prints the module's name in the container header and hangs the manifest's
 * `summary` off it as a tooltip. A page that also printed "Notes" at the top of
 * itself would be saying the name twice and spending a fixed strip of a
 * 340-pixel-tall container on the repetition. Unframed there is no container header, so
 * the heading stays — see `NoProject`, which is the only screen an unframed
 * page can reach now that a project's notes live in that project.
 */
export function App() {
  const [looked, setLooked] = useState<Looked | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /**
   * How far out the list is standing from the reader.
   *
   * `null` follows them. The other two are rungs of the ladder in
   * `notes/scope.ts`, and the reason this is a ladder rather than the boolean
   * it replaced is that the boolean had no middle: from a passage the only
   * offer was "every note in this project", which is not the list you came
   * from. A person who pressed a note to look at it in the paper, or who
   * selected a sentence, had no way back to the notes on the file they were
   * reading -- the rung they actually wanted, and the one the scope ladder
   * already had a name for.
   */
  const [widen, setWiden] = useState<null | 'document' | 'everything'>(null)
  const [withResolved, setWithResolved] = useState(false)
  const [draft, setDraft] = useState('')
  /**
   * Whether the box for writing one is open.
   *
   * It used to be always open, which put a quotation of the passage and an
   * empty textarea above every list of notes. On a passage that IS a note --
   * press a note, and the canvas points at its own passage -- that quotation
   * was the note's own words printed a second time, once with its markup and
   * once without, directly above the row saying them.
   *
   * Opened by default only when there is nothing to read. Then the form is the
   * answer to "there are no notes here", and nothing is being buried by it.
   */
  const [writing, setWriting] = useState(false)
  const [round, setRound] = useState(0)
  /** Whether the notes this app has stopped lifting are on screen. One press. */
  const [showWithdrawn, setShowWithdrawn] = useState(false)

  /**
   * The note this container pointed the canvas at, and what the list was
   * showing when it did.
   *
   * ## Pressing a note used to be a one-way door
   *
   * A press points every container at that note's passage, which is the whole
   * point of it. But the list is scoped BY that passage -- it follows the
   * reader -- so pointing at a note narrowed the list to that one note, and the
   * other notes were gone. The way back was a ghost button at the bottom
   * labelled "every note in this project", which is a different scope from the
   * one that had just been lost. Somebody who pressed a note to look at it in
   * the paper could not get back to the list they pressed it from.
   *
   * ## Following the reader and being the reader are different acts
   *
   * The list follows the reader because somebody moving through a document
   * should see the notes where they are standing. That is right, and it is not
   * what a press from this list is. A press is this container MOVING the reader,
   * on purpose, to somewhere it is already showing -- and a view that re-scoped
   * itself to the thing it just sent you to is a view that answers a question
   * nobody asked, by discarding the one they were reading.
   *
   * So while the canvas is pointed where this container put it, the list holds
   * the scope it had, and the note is marked instead. The moment a passage
   * arrives that this container did not publish, the reader has moved on their
   * own and the list follows them again.
   *
   * This is also what the person asking for it described -- "when you click on
   * a note shouldn't it highlight and show what its target from the paper?" --
   * a highlight and a moved paper, not a new list.
   */
  const [pointed, setPointed] = useState<Pointed<Passage> | null>(null)

  const onGoto = useCallback<GotoHandler>((message, answer) => {
    /* A `goto` may name an epic, a step, or a reference. This container draws notes
       against a place in a document, and none of those three is one — saying so
       quickly is what gets the reader the host's fallback link instead of a
       twelve-second wait. */
    answer(
      false,
      message.ref
        ? 'This container shows notes anchored to passages of a document, so there is nothing here to walk to by reference.'
        : 'This container shows notes on a document, so there is nothing here to walk to by epic or step.',
    )
  }, [])

  const { where, project, projectPath, passage, resize, point } = useRoadmap(ID, onGoto)

  /**
   * How big the box is, and therefore what is worth drawing in it.
   *
   * The whole of the decision is in `notes/room.ts`; what it is used for here
   * is the column below — a heading that does not scroll away, a list that
   * scrolls under it, and a form that takes the frame when a strip above the
   * list would BE the list.
   */
  const room = useRoom()

  /**
   * The scope, computed from the passage by the same function the server uses.
   *
   * One definition of the ladder, imported rather than restated — see
   * `notes/scope.ts`. The heading a reader sees and the heading an agent is
   * given at the door come from the same `saidOf`, so the two cannot describe
   * different lists to each other.
   */
  /**
   * What the list is scoped to, which is the passage EXCEPT while the canvas is
   * pointed where this container pointed it. See `pointed` above.
   */
  const shownAt = useMemo(() => heldAt(pointed, passage), [pointed, passage])

  const scope = useMemo(() => scopeOf(shownAt), [shownAt])

  /**
   * The rung on screen, which is the passage's own scope until somebody climbs.
   */
  const shownScope: Scope = useMemo(() => {
    if (widen === 'everything') return { kind: 'everything' }
    if (widen === 'document' && shownAt) return { kind: 'document', path: shownAt.path }
    return scopeOf(shownAt)
  }, [widen, shownAt])

  /**
   * The way out, in at most two presses, and never more than the rung allows.
   *
   * One climbs and one returns, and they are separate because a single control
   * that did both would have to be labelled with neither. A reader narrowed to
   * a passage wants the file; a reader on the file may want the project; a
   * reader anywhere out wants to be following again. Nothing offers a rung it
   * is already on, and nothing offers "follow the reader" to somebody who
   * already is.
   */
  const climbs = useMemo(() => {
    const out: { said: string; press: () => void }[] = []
    if (widen === null && (shownScope.kind === 'passage' || shownScope.kind === 'page')) {
      out.push({ said: `all of ${fileOf(shownScope.path)}`, press: () => setWiden('document') })
    }
    if (widen === 'document') {
      out.push({ said: 'all in project', press: () => setWiden('everything') })
    }
    if (widen !== null) out.push({ said: 'follow the reader', press: () => setWiden(null) })
    return out
  }, [widen, shownScope])

  /* Read inside the press, which is why it is a ref: `actions` is memoised on
     what a press NEEDS, and adding the current scope to that list would rebuild
     every row's handlers on every move of the reader. */
  const shownAtRef = useRef<Passage | null>(null)
  shownAtRef.current = shownAt
  /* And where the reader actually is, which is not the same value once a press
     is standing -- see `since` in `notes/pointed.ts`. */
  const passageRef = useRef<Passage | null>(null)
  passageRef.current = passage

  /*
   * A passage this container did not publish means the reader moved themselves,
   * and the list goes back to following them.
   */
  useEffect(() => {
    if (pointed && !standing(pointed, passage)) setPointed(null)
  }, [passage, pointed])

  /*
   * A pointing reader clears the widened view.
   *
   * Without this, somebody who pressed "show every note" would stay widened
   * while they highlighted a sentence, and the container would go on showing the
   * project while the reader watched their own selection do nothing. The press
   * is an answer to "nothing is pointing"; a passage arriving is that question
   * being answered better.
   */
  useEffect(() => {
    /* Unless it is this container's own press arriving back. A press is not a
       reader answering "nothing is pointing"; it is this list sending them
       somewhere, and it must not throw away the widened view it was pressed
       from any more than it throws away a narrow one. */
    if (passage && !standing(pointed, passage)) setWiden(null)
  }, [passage, pointed])

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
    if (widen === 'everything') {
      return { project, projectPath, path: null, page: null, from: null, to: null, everything: true, resolved: withResolved }
    }
    if (!shownAt) return null
    /* One rung out: the whole file, with the range and the page dropped. The
       document rung is what "back" means for somebody reading one document, and
       it costs nothing to ask for -- the store has always been able to answer
       it, and nothing offered it. */
    if (widen === 'document') {
      return {
        project,
        projectPath,
        path: shownAt.path,
        page: null,
        from: null,
        to: null,
        everything: false,
        resolved: withResolved,
      }
    }
    return {
      project,
      projectPath,
      path: shownAt.path,
      page: shownAt.page,
      from: shownAt.from,
      to: shownAt.to,
      everything: false,
      resolved: withResolved,
    }
  }, [where, widen, shownAt, project, projectPath, withResolved])

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
       * `notes/anchor.ts` exists to make visible, and it would be this container
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
        ? (one: Anchored) => {
            const at = {
              path: one.note.path,
              page: one.note.page,
              from: one.anchor.from,
              to: one.anchor.to,
              quoted: one.note.quoted.slice(0, 2000),
            }
            /* What the list is showing RIGHT NOW, which is not the same as the
               live passage once a previous press is standing -- pressing a
               second note from a held list must hold the same list, not the
               passage the first press published. */
            setPointed({
              id: one.note.id,
              at: keyOf(at),
              /* Where the reader is standing as this press is made. The echo of
                 the press cannot arrive before the render this line causes, so
                 without it every press is thrown away by the effect above
                 before anybody sees it. */
              since: passageRef.current ? keyOf(passageRef.current) : null,
              was: shownAtRef.current,
            })
            point(at)
          }
        : null,
      busy,
    }),
    [write, busy, point, where],
  )

  /**
   * How tall this page would like to be, asked for whenever what it draws
   * changes. The host clamps it and may ignore it; that is the protocol.
   *
   * Two elements and not one, because the page is a column now: a heading that
   * stays put and a list that scrolls under it. What is measured is the
   * CONTENT — the heading's own box, and the natural height of the block inside
   * the scroller, which is a number about the notes rather than about the
   * frame. Measuring the scroller instead would be this page reading back the
   * height it was given and asking for it again, which is a container that can
   * grow and never shrink for a reason no reader could ever discover.
   */
  const crown = useRef<HTMLDivElement | null>(null)
  const scroller = useRef<HTMLDivElement | null>(null)
  const body = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const inside = body.current
    if (!inside) return
    resize((crown.current?.offsetHeight ?? 0) + inside.scrollHeight + 16)
  }, [resize, looked, refused, where, room])

  /**
   * Which rows may carry a snap point, marked on the row itself.
   *
   * The scroller snaps by proximity — see the rule in `index.css` — and a row
   * taller than the window must be left out of it, or reading the bottom of a
   * long note is a fight with a scroller that keeps offering to put its top
   * back at the top. `notes/room.ts` holds the rule; this is the measuring,
   * which cannot be a rule because it is about pixels a browser decided.
   *
   * Every row is observed, not just the scroller: a row grows when somebody
   * presses it open, and a row that was snappable a moment ago may be a page
   * long now.
   */
  useEffect(() => {
    const el = scroller.current
    if (!el || !room.snap || typeof ResizeObserver === 'undefined') return
    const rows = () => Array.from(el.querySelectorAll<HTMLElement>('[data-testid="note"]'))
    const mark = () => {
      const view = el.clientHeight
      for (const row of rows()) {
        if (snappable(row.offsetHeight, view)) delete row.dataset.tall
        else row.dataset.tall = '1'
      }
    }
    const watcher = new ResizeObserver(mark)
    watcher.observe(el)
    for (const row of rows()) watcher.observe(row)
    mark()
    return () => watcher.disconnect()
  }, [room.snap, looked, showWithdrawn, withResolved])

  if (where === 'listening') return <Listening />
  /* Before every other screen, because it is the one that says there is no
     store at all. `Nowhere` offers a press that widens to the project, and
     offering it here would be offering to read a file that does not exist. */
  if (!projectPath) return <NoProject unhosted={where === 'unhosted'} />
  if (looked?.trouble) return <Trouble said={looked.trouble} />
  if (!ask) return <Nowhere project={project} onEverything={() => setWiden('everything')} />

  const canWrite = widen === null && scope.kind !== 'nowhere' && scope.kind !== 'everything'
  /* Nothing to read HERE -- adrift and withdrawn notes are on the document
     rather than at this scope, and a form opening over them would be the same
     burial in a different place. */
  const nothingHere = !looked?.shown.length

  /**
   * Whether the form is up, and the one case where its full-frame shape is
   * refused.
   *
   * The form opens by itself when there is nothing to read, which is right: it
   * is then the answer to "there are no notes here" rather than something
   * burying them. A form that opened by itself AND took the whole frame would
   * be neither -- it would cover the heading, the ladder back out, and the
   * sentence saying why the list is empty, on a container the reader had only
   * just pointed somewhere. So in a small container an empty list keeps its
   * sentence and its press, and the frame is taken only by somebody pressing.
   */
  const composing = canWrite && (writing || (nothingHere && room.compose === 'inline'))

  const submit = () => {
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
      if (ok) {
        setDraft('')
        setWriting(false)
      }
    })
  }

  const compose = composing ? (
    <Compose
      room={room}
      quoted={passage?.quoted ?? null}
      passage={scope.kind === 'passage'}
      said={briefOf(shownScope)}
      busy={busy}
      draft={draft}
      onDraft={setDraft}
      onSubmit={submit}
      onCancel={writing ? () => setWriting(false) : null}
    />
  ) : null

  /*
   * A column: a heading that stays, a list that scrolls under it, and a form
   * that can cover both.
   *
   * ## The heading is out of the scroller, and that is the whole change
   *
   * This page used to be one growing block. In a container tall enough to hold
   * it that is the same thing as this; in the 200-pixel one a canvas actually
   * gives it, the first flick of a trackpad took the scope and the way back off
   * the top of the frame -- measured at 62 pixels above the fold after a
   * seventy-pixel scroll. The ladder ("all of main.tex", "all in project",
   * "follow the reader") is the way back from a narrowed list, and a way back
   * that scrolls away is a way back somebody has to already know is there.
   *
   * ## `h-dvh`, and why it does not fight the host
   *
   * Inside a frame `dvh` is the frame, so this column is exactly the box the
   * canvas drew and the scrolling happens INSIDE it rather than on the
   * document. What the host is asked for is still the height of the CONTENT --
   * see the resize effect -- so a container whose owner let it grow still grows to
   * fit, and one whose owner did not is a box this page fills honestly instead
   * of overflowing.
   */
  return (
    <div className="relative flex h-dvh min-h-0 flex-col">
      <div ref={crown} className="min-w-0 shrink-0 px-2 pt-2 pb-1 @sm/container:px-3 @sm/container:pt-3">
        {/*
         * What this container is showing, and the way out of it.
         *
         * The scope is still never a count -- a reader who cannot see what was
         * narrowed cannot tell narrowing from a bug -- but it is now the short
         * form of the same ladder. The sentence it replaced spelled out a
         * ninety-character absolute path that was printed again on every row
         * below it, in a column too narrow for one of them. `title` keeps the
         * whole path one hover away; see `briefOf`.
         *
         * The way back sits ON the heading rather than among the toggles at the
         * bottom, because it is not a preference. It is the answer to "how do I
         * get back to the notes I was looking at", and it was the one control
         * that did not exist: from a passage the only offer was "every note in
         * this project", two rungs out and a different list.
         */}
        {/* Wrapping, because at 220 pixels the scope and two rungs of the ladder
            do not fit on a line and the rungs are not droppable: they are the way
            back. Two short lines that stay put beat one line that scrolls away. */}
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <p
            data-testid="scope"
            title={widen === 'everything' ? undefined : (shownAt?.path ?? undefined)}
            className="min-w-0 flex-1 truncate text-xs font-medium"
          >
            {briefOf(shownScope)}
          </p>
          {climbs.map((climb) => (
            <Button
              key={climb.said}
              size="container"
              variant="ghost"
              data-testid="widen"
              onClick={climb.press}
            >
              {climb.said}
            </Button>
          ))}
          {/*
           * The one press that adds anything, kept beside the way back rather
           * than at the top of the list.
           *
           * It used to be the first thing in the scroller, which is the same
           * place in a container tall enough to show the whole page and a
           * different place in the 300-pixel one: two notes down the list it
           * had scrolled off, and the only way to write a note about the
           * passage on screen was to scroll back to a control the reader could
           * no longer see. It costs a line of the heading at 220 pixels. It is
           * the module's only way to write anything down.
           */}
          {canWrite && !composing ? (
            <Button size="container" variant="ghost" data-testid="write" onClick={() => setWriting(true)}>
              write a note here
            </Button>
          ) : null}
        </div>
      </div>

      <div
        ref={scroller}
        data-scroller="1"
        /* Snapping is an attribute rather than a class because the rule it
           turns on has to reach the rows inside, and one of those rows may be
           excluded from it by measurement. See `index.css`. */
        data-snap={room.snap ? '1' : undefined}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto px-2 pb-2 @sm/container:px-3 @sm/container:pb-3"
      >
        <div ref={body} className="min-w-0 space-y-2">
          {refused ? (
            <p data-testid="refusal" className="min-w-0 text-xs text-adrift">
              {refused}
            </p>
          ) : null}

          {/* Which documents could not be opened, in a paragraph -- and not in a
              container with no room for a paragraph, where every row already
              carries the word `unchecked` in the one place a reader is looking. */}
          {looked && !looked.verified && room.notices && (looked.shown.length > 0 || looked.adrift.length > 0) ? (
            <p data-testid="unchecked" className="min-w-0 text-[0.7rem] text-muted-foreground">
              These documents could not be opened: each note shows the words it was written about, not what is there now.
            </p>
          ) : null}

          {/* In the flow of the list where there is room for it, and over the whole
              frame where there is not -- in which case it is drawn at the bottom of
              this file rather than here, because it is over the heading too. */}
          {room.compose === 'inline' ? compose : null}

          {looked?.shown.length ? (
            <ul className="min-w-0">
              {looked.shown.map((one) => (
                <NoteRow key={one.note.id} one={one} actions={actions} pointed={pointed?.id === one.note.id} room={room} />
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
                {looked.adrift.length} note{looked.adrift.length === 1 ? '' : 's'} can no longer be placed in this document
              </p>
              <ul className="min-w-0">
                {looked.adrift.map((one) => (
                  <NoteRow key={one.note.id} one={one} actions={actions} pointed={pointed?.id === one.note.id} room={room} />
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
              {/*
               * A press, and no standing sentence above it.
               *
               * What these are is narrow and specific: `%` comments from before
               * `\begin{document}` -- the document class, the fonts, the macros
               * that define the note commands. This app used to read them as notes
               * about the text and no longer does.
               *
               * It said so in a line that stood there always, and the line said
               * "from this file's build rather than its argument", which is this
               * codebase's own metaphor and meant nothing to the person reading it
               * -- they said as much. A reader who has never seen these notes needs
               * no sentence at all; one who remembers them needs the plain word for
               * where they came from, which is `preamble`, and needs it once, when
               * they go looking.
               */}
              <Button
                size="container"
                variant="ghost"
                data-testid="show-preamble"
                onClick={() => setShowWithdrawn((was) => !was)}
              >
                {showWithdrawn
                  ? 'hide preamble comments'
                  : `show ${looked.withdrawn.length} preamble comment${looked.withdrawn.length === 1 ? '' : 's'}`}
              </Button>
              {showWithdrawn ? (
                <>
                  <p className="min-w-0 text-[0.7rem] text-muted-foreground">
                    Comments from before <code>{'\\begin{document}'}</code> — the document class, the fonts, the macros.
                    No longer read as notes about the text.
                  </p>
                  <ul className="min-w-0">
                    {looked.withdrawn.map((one) => (
                      <NoteRow key={one.note.id} one={one} actions={actions} pointed={pointed?.id === one.note.id} room={room} />
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          ) : null}

          {looked?.elsewhere ? (
            <p data-testid="elsewhere" className="min-w-0 text-[0.7rem] text-muted-foreground">
              {looked.elsewhere} more on this document, outside this selection.
            </p>
          ) : null}

          <div className="flex min-w-0 flex-wrap gap-1">
            <Button size="container" variant="ghost" onClick={() => setWithResolved((was) => !was)}>
              {withResolved ? 'hide resolved' : 'show resolved'}
            </Button>
            {/* Widening moved to the heading, where it reads as the way back rather
                than as one more preference. What is left here is the one thing that
                genuinely is a preference. */}
          </div>
        </div>
      </div>

      {room.compose === 'fill' ? compose : null}
    </div>
  )
}
