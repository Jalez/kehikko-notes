import { Button } from '@/components/ui/button.tsx'

/**
 * The screens that are not a list of notes, and each one names why it is there.
 *
 * Every one of these is a place where a lesser version of this app would draw
 * an empty list and let the reader conclude something wrong. An empty list says
 * "there is nothing here". These say which of the four quite different reasons
 * that is — and since the notes moved into the projects there is a new one,
 * `NoProject`, which is the difference between "nothing is written here" and
 * "there is no here".
 */

/**
 * Nobody said where the project is, so there is nowhere to read or write.
 *
 * ## What this replaced, and why the escape hatch had to go with it
 *
 * There used to be an `Unhosted` screen here for a page nobody was framing, and
 * it offered a button: "show every note". That button worked because there was
 * one file beside this program holding every project's notes, with a pile
 * inside it belonging to nobody in particular — so there was always something
 * to show, even standing nowhere.
 *
 * The file and the pile are both gone. A project's notes are in that project,
 * at `<project>/.kehikot/notes/notes.json`, so with no project path there is no file
 * to open: not an empty one, not a default one, none at all. There is nothing
 * left for that button to show, and nowhere for a note written here to go.
 *
 * ## Saying so is better than the button was
 *
 * A container that drew a spinner, an error, or an empty list would each describe a
 * fault that does not exist. `projectPath` is nullable on the wire for
 * perfectly ordinary reasons — nobody has opened a project, this page was
 * opened directly on its own port, or the host has no filesystem of its own to
 * point at — and not one of them is this app being broken.
 *
 * What it must never do is guess. A guessed folder means somebody's note
 * written into a directory they will never open, under a screen that told them
 * it was saved. So this says which fact is missing and where notes would live
 * if it had it, and offers no press at all: there is no action available from
 * here that would not be an invention.
 */
export function NoProject({ unhosted }: { unhosted: boolean }) {
  return (
    <div className="min-w-0 space-y-2 p-3">
      {unhosted ? <h1 className="text-sm font-semibold">Notes</h1> : null}
      <p data-testid="no-project" className="min-w-0 text-xs text-muted-foreground">
        {unhosted
          ? 'Nothing is framing this page, so nothing has said which project is open.'
          : 'This canvas has not said where its project is on disk.'}{' '}
        Notes are kept inside the project they are about — <code>{'<project>/.kehikot/notes/notes.json'}</code> — so there is
        nothing here to read and nowhere to write.
      </p>
      <p className="min-w-0 text-xs text-muted-foreground">
        This app will not guess at a folder. A note written into a directory nobody named is a note nobody will ever
        look in, and the page would have said it was saved.
      </p>
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
 * what they had, or a project whose papers nobody has placed. A container that drew
 * a spinner, or an error, or an empty list with no explanation would be
 * describing a bug that does not exist, for every reader with no document
 * open.
 *
 * So it says exactly what is true: notes are about places in documents, nobody
 * has said where anybody is standing, and here is the whole project instead if
 * that is what you wanted. The escape hatch is a PRESS rather than a default,
 * because the container pretending it had been given a scope is the one thing that
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
        No document is open, so there is no place for a note to be about. This container narrows to whatever the reader is
        pointing at — a document, a page of it, or a passage — and nothing on this canvas is pointing at anything.
      </p>
      <p className="text-xs text-muted-foreground">
        A module that shows documents has to say where its reader is standing before this one can follow. Until it
        does, nothing here is wrong; there is simply nowhere to narrow to.
      </p>
      <Button size="container" variant="outline" onClick={onEverything}>
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
