import { Button } from '@/components/ui/button.tsx'

/**
 * The screens that are not a list of notes, and each one names why it is there.
 *
 * Every one of these is a place where a lesser version of this app would draw
 * an empty list and let the reader conclude something wrong. An empty list says
 * "there is nothing here". These say which of the four quite different reasons
 * that is. The moments before there is anything to draw at all — waiting for a
 * greeting, nothing framing the page, no project folder, this app's own server
 * not answering — are the protocol's one shared `Cover`, drawn in `app.tsx`.
 */

/**
 * What the shared cover says under its own sentence when there is no project folder — a page
 * nobody is framing, or a canvas that has not said where its project is on disk.
 *
 * The cover (`Cover` from the protocol, drawn in `app.tsx`) says which fact is missing; this says
 * what follows from it HERE, which the shared sentence cannot: a project's notes are a file inside
 * that project, so with no folder there is no file — not an empty one, not a default one. It offers
 * no press, because every action available from there would be a guess, and a guessed folder is
 * somebody's note written into a directory they will never open under a screen that said it was
 * saved.
 */
export const NO_STORE =
  'Notes are kept inside the project they are about — <project>/.kehikot/notes/notes.json — so there is nothing here '
  + 'to read and nowhere to write.'

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
