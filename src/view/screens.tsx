import { Button } from '@/components/ui/button.tsx'

/**
 * The screens that are not a list of notes, and each one names why it is there.
 *
 * Every one of these is a place where a lesser version of this app would draw
 * an empty list and let the reader conclude something wrong. An empty list says
 * "there is nothing here". These say which of the four quite different reasons
 * that is.
 */

/**
 * Nothing is framing this page.
 *
 * The standalone case, and it is a real one: this app runs on its own port and
 * somebody may simply have opened it. It cannot know which project or which
 * document, because those are things a host says — so it says so, and offers
 * the one thing it can do without being told anything, which is show every note
 * it holds that nobody attributed to a project.
 */
export function Unhosted({ onEverything }: { onEverything: () => void }) {
  return (
    <div className="min-w-0 space-y-2 p-3">
      <h1 className="text-sm font-semibold">Notes</h1>
      <p className="text-xs text-muted-foreground">
        Nothing is framing this page, so nothing has said which project is open or which document anybody is reading.
        Notes are anchored to a document and partitioned by project, and both of those are facts a roadmap tells this
        app rather than ones it can work out.
      </p>
      <p className="text-xs text-muted-foreground">
        It still holds everything ever written here. That is all it can offer from outside a canvas.
      </p>
      <Button size="pane" variant="outline" onClick={onEverything}>
        show every note
      </Button>
    </div>
  )
}

/**
 * Framed, but nobody is pointing at a document.
 *
 * ## This is the ordinary state today, and it must not look like a fault
 *
 * `context.passage` is null whenever nothing on the canvas is showing a
 * document, which is a canvas somebody has just opened, a reader who closed
 * what they had, or a project whose papers nobody has placed. A pane that drew
 * a spinner, or an error, or an empty list with no explanation would be
 * describing a bug that does not exist, for every reader with no document
 * open.
 *
 * So it says exactly what is true: notes are about places in documents, nobody
 * has said where anybody is standing, and here is the whole project instead if
 * that is what you wanted. The escape hatch is a PRESS rather than a default,
 * because the pane pretending it had been given a scope is the one thing that
 * would make the ladder above it meaningless.
 */
export function Nowhere({
  project,
  onEverything,
}: {
  project: string | null
  onEverything: () => void
}) {
  return (
    <div className="min-w-0 space-y-2 p-3">
      <p className="text-xs text-muted-foreground">
        No document is open, so there is no place for a note to be about. This pane narrows to whatever the reader is
        pointing at — a document, a page of it, or a passage — and nothing on this canvas is pointing at anything.
      </p>
      <p className="text-xs text-muted-foreground">
        A module that shows documents has to say where its reader is standing before this one can follow. Until it
        does, nothing here is wrong; there is simply nowhere to narrow to.
      </p>
      <Button size="pane" variant="outline" onClick={onEverything}>
        {project ? `show every note in ${project}` : 'show every note in this project'}
      </Button>
    </div>
  )
}

/** The store could not be read, which is the one thing this app refuses to write over. */
export function Trouble({ said }: { said: string }) {
  return (
    <div className="min-w-0 space-y-2 p-3">
      <p className="text-xs text-adrift">{said}</p>
    </div>
  )
}

/** Waiting for a greeting, for under a second, saying what it is waiting for. */
export function Listening() {
  return (
    <div className="min-w-0 p-3">
      <p className="text-xs text-muted-foreground">Waiting to be told which project and which document are open…</p>
    </div>
  )
}
