import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ModuleContext } from 'roadmap-module-protocol'

import { connect, type Host, type HostEvents } from './host.ts'

/**
 * The bridge, as one React value.
 *
 * `host.ts` is the wire and knows no React; this is the only file that turns
 * messages into state, and it is deliberately the only one. Two places driving
 * "what can this page see" would eventually disagree.
 *
 * ## What this hook holds, which is nearly nothing
 *
 * Three facts and a theme. Which project the reader is in, where that project
 * is on disk, and where in a document they are pointing. Everything else the
 * pane shows comes from this app's own store, over its own `/api`, and nothing
 * here is asked of the host at all — this module declares no capabilities and
 * makes no requests. What it needs is what a context already carries.
 *
 * ## The passage is handed on whole and never remembered
 *
 * The one rule with teeth: `passage` is applied on every context, including
 * when it is null, and the page never keeps the last one. A pane that held onto
 * the last passage would go on showing the notes on a chapter the reader closed
 * ten minutes ago — indistinguishable, on screen, from the chapter still being
 * open. The protocol makes the field nullable precisely so that "no document"
 * is a state a module can move INTO, and this hook is where that promise is
 * either kept or quietly broken.
 *
 * ## The grace, and why there is one
 *
 * A page cannot know at load whether it is framed. It has to wait to find out,
 * because the greeting arrives when the host is ready rather than when we are,
 * and a page that concluded "nobody is there" in the first frame would say so
 * and then be greeted a moment later — the reader would see the standalone
 * paragraph flash past and be replaced, which teaches them that paragraph is
 * noise. So there is a `listening` state with its own words, it lasts under a
 * second, and only then does the page say the harder thing.
 *
 * It is not a spinner. It says what it is waiting for.
 */
const GREETING_GRACE_MS = 700

/**
 * Whether anything is framing this page, in the three states that matter.
 *
 * Three rather than a boolean, because "we have not heard yet" is not "nobody
 * is there": one lasts under a second and the other is the standalone case this
 * app is built to work in. Drawing the second while in the first is the flicker
 * the grace above exists to prevent.
 */
export type Where = 'listening' | 'unhosted' | 'hosted'

/** A passage, as the context carries one. */
export type Passage = NonNullable<ModuleContext['passage']>

export interface Roadmap {
  where: Where
  /** What the project is called, as the host says it. Null when nobody has said. */
  project: string | null
  /** Where that project is on disk. What this app's store is actually partitioned by. */
  projectPath: string | null
  /**
   * Where the reader is pointing, or null.
   *
   * Never what this page asked for — this page never asks. It declares no
   * `passage:set`, has no control that would set one, and its whole job is to
   * answer a question about where somebody else is already pointing.
   *
   * Null today, always, on every host in this workspace: the module that shows
   * papers does not call `passage.set` yet. That is not a broken state and the
   * page must not draw it as one — see `Nowhere` in `src/view/screens.tsx`.
   */
  passage: Passage | null
  /** Say how tall this page would like its frame to be. Silent when nothing is framing it. */
  resize: (height: number) => void
}

/**
 * What to do when the host says "go to this reference".
 *
 * Handed in rather than handled here, because the answer depends on what is on
 * screen, and that is the view's business. The contract is the protocol's:
 * `answer` must be called, and calling it late is the same as not calling it —
 * see the backstop in `host.ts`.
 */
export type GotoHandler = NonNullable<HostEvents['onGoto']>

export function useRoadmap(id: string, onGoto: GotoHandler): Roadmap {
  const [where, setWhere] = useState<Where>('listening')
  const [project, setProject] = useState<string | null>(null)
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [passage, setPassage] = useState<Passage | null>(null)
  const host = useRef<Host | null>(null)

  /**
   * The handler, held in a ref and read at the moment a `goto` arrives.
   *
   * The view rebuilds this function whenever the rows change, and connecting to
   * the window again on every render would mean a torn-down listener during the
   * one millisecond a host chose to greet in. So the listener is established
   * once and always calls the newest handler.
   */
  const goto = useRef(onGoto)
  goto.current = onGoto

  useEffect(() => {
    /**
     * What the greeting and every later context both do.
     *
     * The theme is applied here rather than in a component, because it is a
     * fact about the document rather than about any part of it: the host says
     * light or dark and the root element carries it. `light` is set explicitly
     * as well as `dark`, so that a host asking for light over a machine set to
     * dark actually gets it — see the media query in `index.css`.
     */
    const arrived = (context: ModuleContext) => {
      const root = document.documentElement
      root.classList.toggle('dark', context.theme === 'dark')
      root.classList.toggle('light', context.theme === 'light')

      setWhere('hosted')
      setProject(context.project ?? null)
      setProjectPath(context.projectPath ?? null)
      /*
       * Compared before it is written, because it is an OBJECT.
       *
       * A context arrives after every change anywhere on the canvas, and a
       * fresh `{path, page, from, to, quoted}` with identical contents every two
       * seconds would be a new identity in every memo downstream — which here
       * means re-asking this app's own store for the same list of notes several
       * times a second. The strings are compared rather than the references
       * because the host builds a new object each time whatever happens.
       */
      setPassage((was) => (same(was, context.passage ?? null) ? was : (context.passage ?? null)))
    }

    /**
     * The connection is stored BEFORE the greeting is acted on, and the order is
     * the whole of a bug that made a sibling module hang forever.
     *
     * `connect` subscribes to the mailbox, and the mailbox replays what has
     * already arrived SYNCHRONOUSLY, inside that call. The greeting almost
     * always arrives before React mounts — that is the entire reason the mailbox
     * exists — so `onHello` fires on this line, before `host.current` has been
     * assigned. Anything reading `host.current` then finds null and quietly does
     * nothing.
     *
     * Worse, it works often enough to look fine. When the host happens to greet
     * after this effect returns — a slow module, a reload, a busy machine — the
     * assignment has already happened and everything behaves. A race whose good
     * outcome is the common one is the kind that ships.
     */
    let ready = false
    const early: { context: ModuleContext | null } = { context: null }
    const heldEarly = (context: ModuleContext) => {
      if (ready) arrived(context)
      else early.context = context
    }

    host.current = connect(id, {
      onHello: (context) => heldEarly(context),
      onContext: (context) => heldEarly(context),
      onGoto: (message, answer) => goto.current(message, answer),
    })
    ready = true
    if (early.context) arrived(early.context)

    const grace = setTimeout(() => {
      setWhere((was) => (was === 'listening' ? 'unhosted' : was))
    }, GREETING_GRACE_MS)

    return () => {
      clearTimeout(grace)
      host.current?.stop()
      host.current = null
    }
  }, [id])

  const resize = useCallback((height: number) => host.current?.resize(height), [])

  return useMemo(
    () => ({ where, project, projectPath, passage, resize }),
    [where, project, projectPath, passage, resize],
  )
}

/** Whether two passages say the same thing. Field by field, because the object is rebuilt every context. */
function same(a: Passage | null, b: Passage | null): boolean {
  if (a === null || b === null) return a === b
  return a.path === b.path && a.page === b.page && a.from === b.from && a.to === b.to && a.quoted === b.quoted
}
