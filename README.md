# Notes

Notes anchored to a place in a document: a file, a page, a byte range, and the
words that were there when the note was written. The container narrows as the reader
narrows.

An app. Its own store, its own page, its own port. A host may frame it, and then
it learns which project is open and where in a document somebody is pointing.

```
./run.sh                      # http://127.0.0.1:7940
bun run register              # tell a host on this machine where it answers
bun test                      # 110 tests, no browser needed for any of them
```

## The ladder

The ask this module exists for:

> "Paper should provide information on what is being highlighted or selected, so
> that the notes module can be used to create notes on the selected item.  Notes
> should show notes in a way that ensures specificity based on what is selected.
> For instance if nothing is selected but paper module shows a page, it should
> show all notes related to that page vs if only a part of the page is selected."

That is one fact — where the reader is pointing — known to four depths, so it
travels as one nullable field in `roadmap.context`:

```
passage: { path, page, from, to, quoted } | null
```

| what the host says | what this container shows |
| --- | --- |
| `null` | An explanation. No document is open, so there is no place for a note to be about. |
| `{ path }` | Every note on that document. |
| `{ path, page }` | The notes on that page, and a count of the ones elsewhere in the document. |
| `{ path, page, from, to, quoted }` | The notes overlapping that passage, and a count of the rest. |

The field is `passage` in `roadmap-module-protocol` 0.9.0, set by
`passage.set` under the `passage:set` capability. This module CONSUMES it and
declares no capabilities at all — the module that shows the document is the one
that points.

Narrowing always says what it narrowed away. A reader who selects a sentence and
sees two notes must be able to tell "there are two notes here" from "there are
eleven and nine are behind a filter nobody mentioned".

The two filters this page has — whether resolved notes are in the list, and
whether the preamble comments it no longer lifts are — are OFFERED rather than
drawn, over `roadmap.filters`. The host draws one control in the container
header and sends the choice back in `context.filters`, remembered per container.
The counts stay on the page, because a host cannot count rows it does not
render. The scope ladder is not a filter and did not move: it is the way back
out of a narrowed list and it belongs where a lost reader is looking.

## Anchors rot, and this says so

A note is anchored to a byte range, and somebody adds a paragraph forty lines up.
Every offset below it is now wrong. Nothing in a pair of numbers can notice: the
range still parses, still lands in the file, and still names a sentence — the
wrong one. That is not a risk on a document somebody is still writing; it is a
certainty.

So the note keeps the WORDS as well as the numbers, and every read compares them
against the file:

| verdict | what happened |
| --- | --- |
| **anchored** | The words at the note's own offsets are still its words. |
| **moved** | The words are in the file at a different place. Reported, with how far, and never silently corrected. |
| **adrift** | The words are not in the file at all. The note is shown, marked, with its quote — at every scope, never filtered away. |
| **unchecked** | This app could not open the document. It has no opinion, and says so rather than claiming health. |
| **whole page** | Written with nothing selected, so there is no range to rot. Its page is a weak anchor and the row says so. |

Nothing is ever re-anchored automatically. `reanchor_note`, or one press on the
page, is how a record is made to match a file — because silently rewriting
somebody's note to match a file this program guessed about is the same class of
mistake as attaching it to the wrong sentence, and unrecoverable rather than
visible. Nothing is ever deleted either: `resolve_note` is what "dealt with"
means, and it is reversible.

## Which files it opens

One reason only: to check an anchor. Nothing is written, nothing is cached, and
no byte of any document ever crosses a door — what comes back is a verdict and
the note's own quote.

`NOTES_ROOTS` (colon-separated absolute paths) says where it may look. Unset, it
falls back to the `projectPath` the host names, which is the one directory it can
be sure it was invited into. Paths are resolved and symlinked through before they
are compared, and anything outside every root is `unchecked` rather than an
error.

## Notes are the project's

The host sends `project` and `projectPath`, and the store partitions on the path
where there is one and the name otherwise. Two projects with a
`chapters/intro.tex` are two piles, not one. A note nobody said a project about
is its own pile and is never merged into whichever project happens to be open.

## A note says where it is inside the project, not on this machine

A note's `path` is stored RELATIVE to the project and resolved against it on
every read. The store is already `<projectPath>/.kehikot/notes/notes.json`, so
the project is the file's own location; an absolute prefix on every note was a
second copy of that fact, and it was the copy that went wrong when the folder
moved — 59 anchors rewritten by hand when the paper moved into
`.kehikot/paper/thesis/`. Move the project now and every note still resolves,
with nothing rewritten.

Absolute paths still arrive at every door — `projectPath` is absolute by design
and so is every passage relayed from it — and are relativised on the way in.
Reading migrates: an absolute path under the project becomes relative the next
time anything writes. An absolute path that is NOT under the project stays
absolute and keeps naming the file it always named; a relative path that climbs
out of the project is never joined onto it, is refused at the door, and is left
alone in a store somebody hand-edited. Nothing is dropped in any of the four
cases. The argument is in `notes/where.ts`.

## The doors

| door | what it is |
| --- | --- |
| `/app` | The page. Generated per request so the write ticket can reach it without a route of its own. |
| `/.well-known/roadmap-module.json` | The manifest. |
| `/healthz` | Whether the store reads, and how many notes are in it. |
| `/mcp` | Five tools: `notes`, `add_note`, `reply_to_note`, `resolve_note`, `reanchor_note`. |
| `/api/notes`, `/api/note` | The page's own read and write. Writes carry a per-process ticket printed into `/app`. |

All of them are middleware in front of the one Vite server, because a module is
one origin or it is nothing.

## House rules this keeps

- `declares.storage: true` and **no `server.cors`**. Verify:
  `curl -sI -H 'Origin: https://evil.example' http://127.0.0.1:7940/app | grep -i access-control`
  prints nothing.
- No `index.html` and no `build` script. `run.sh` runs Vite; a `dist/` would be a
  second answer to "what does this page say".
- React 19, Tailwind v4 CSS-first (no `tailwind.config.js`), shadcn under
  `src/components/ui/` with `cn()`.
- Sized to the PANE with `@container`, never to the viewport. Measured at 220,
  280, 320, 400 and 1200 pixels in both themes: zero horizontal overflow, with a
  108-character unbroken word and a deep absolute path on screen.
