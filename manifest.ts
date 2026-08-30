import { MANIFEST_KIND, PROTOCOL, manifestSchema, type Manifest } from 'roadmap-module-protocol'

export const ID = 'roadmap.notes'
export const VERSION = '1.0.0'

/**
 * What this app says about itself when a host asks.
 *
 * The manifest is the smallest half of this program and the only half a host
 * ever reads. Everything else here works with nothing on the other end — so
 * read this as a description of the ENRICHMENT rather than of the app: which
 * tab to give the page, and which questions the app would like to be allowed to
 * ask if there is anybody there to ask.
 *
 * ## What it declares, and the longer list of what it does not
 *
 * - **`passage:set` — NOT declared, and this is the interesting omission.**
 *   This app is the CONSUMER of a passage, not a producer of one. It reads
 *   `context.passage` to decide what it is showing; it never asks the host to
 *   change what anybody is pointing at. Declaring the capability would be asking
 *   for permission to move every other pane on the canvas, in a module whose
 *   whole job is to answer a question about where somebody else is already
 *   pointing. The module that points is the one showing the document — Paper —
 *   and that is where the declaration belongs.
 *
 *   There is no capability for CONSUMING context, and there should not be: a
 *   context is broadcast to every framed module, and a list of who may read one
 *   would be a permission over something the host is already sending.
 * - **`selection:set` — not declared, for the same reason.** This app reacts.
 * - **`epics:read`, `steps:read`, `live:read` — not declared.** Nothing here is
 *   derived from a tracker. A note is a thing somebody wrote about a sentence,
 *   and none of it is computable from an issue's state. A capability asked for
 *   and never used is the fastest way to teach somebody to press yes without
 *   reading.
 * - **`stage:report` — not declared.** Saying where work is belongs to whoever
 *   is doing it. A note has no opinion about that.
 * - **`view:navigate` — not declared, and it was the closest call in this
 *   file.** Walking a reader to a note's passage is exactly what somebody would
 *   want from a row here, and `view.goto` cannot do it: it names an epic, a
 *   step or a tracker ref, and a note points at a byte range in a `.tex`. So
 *   the capability would be declared for a call that could never carry the ask.
 *   The honest version of that feature is a `passage.set` in the other
 *   direction, and it is not built yet, so nothing is declared for it.
 * - **`events:emit` — not declared, and `emits` is empty.** The sibling module
 *   that keeps checklists announces agents coming through its MCP door, on the
 *   argument that a notification is for what you would otherwise miss. That
 *   argument does not carry here yet, and shipping the machinery for it would
 *   be a second thing to keep working. It is the obvious next capability.
 * - **`state:keep` — not declared.** There is nothing to remember. What this
 *   pane shows is decided entirely by the context it is handed; a filter
 *   remembered across sessions would be a pane showing something other than
 *   what the reader is pointing at, which is the one thing it must not do.
 *
 * ## `prompt: false`
 *
 * The protocol offers a module a prompt: a paragraph a person writes on the
 * canvas, aimed at one pane, composed by the host and delivered in every
 * context. Declaring it makes a host OFFER one, so the question is whether
 * there is work here that has to be described before it can be done.
 *
 * There is not. A note is a thing somebody writes, in this app's own store,
 * with an id, an author, a time and an anchor that can be checked against a
 * file. Every one of those is something a prompt cannot be — unstamped,
 * unversioned, unaddressable, and gone when the canvas moves — and offering one
 * beside them would be offering a second, worse place to write the same thing
 * down.
 *
 * ## The mode, and why it is epic-scoped
 *
 * One mode, which becomes an ordinary tab in the mode row. `scope: 'epic'`
 * because an epic-scoped mode is the one that receives `roadmap.context` — and
 * the context is where `passage` lives. A `global` mode is never sent one,
 * which for this app would mean a pane that can never learn what anybody is
 * pointing at. It also carries `projectPath`, which is what partitions the
 * store, so a global mode would additionally mean every project's notes in one
 * pile.
 *
 * ## Storage, and why THIS module asks for it
 *
 * `storage: true` makes the host frame this page with `allow-same-origin`, so
 * it keeps its real origin instead of running opaque. Modules that hold nothing
 * and ask the host for everything are right to declare `false`; an origin would
 * be a thing they had no use for.
 *
 * This one holds its own material — every note anybody has written — serves it
 * from its own `/api`, and takes writes. Opaque, that combination has a hole in
 * it: an opaque page's fetches to its own `/api` are CROSS-origin, because its
 * origin is `null` and matches nothing, so the server would have to answer with
 * permissive CORS or the app could not read its own notes; and permissive CORS
 * means any page in any tab can read this origin, including `/app`, including
 * the write ticket printed into it. That was demonstrated rather than theorised
 * on a sibling module, with a `curl -H 'Origin: https://evil.example'` that came
 * back carrying both the permissive header and the ticket.
 *
 * Declaring storage closes it at the root: with a real origin this page's
 * scripts and its `/api` calls are ordinary same-origin requests, no CORS header
 * is sent at all, and a stranger reading `/app` gets nothing back. The sandbox
 * is weakened by exactly what that costs, which is little — the origin this page
 * regains is `127.0.0.1:7940` and the host is on `127.0.0.1:4181`, and different
 * ports are different origins, so the page can only reach itself.
 */
export const MANIFEST: Manifest = manifestSchema.parse({
  kind: MANIFEST_KIND,
  /**
   * Parsed rather than shipped as a bare object.
   *
   * The protocol package is explicit that its schemas are a convenience and
   * never the host's check — the host runs its own copy over what arrives on
   * the wire. That cuts both ways: running it HERE is the cheapest way for this
   * app to learn it has written a manifest no host will accept, and to learn it
   * when this file is imported rather than from a host's refusal in somebody
   * else's log.
   */
  protocol: PROTOCOL,
  id: ID,
  name: 'Notes',
  version: VERSION,
  summary:
    'Notes anchored to a place in a document — a file, a page, a byte range and the words that were there — narrowing as the reader narrows.',
  /**
   * What an agent should do about this module, given that it is here.
   *
   * Not the summary. The summary says what this IS, for a person deciding
   * whether to place it. This says what its PRESENCE OBLIGES, and a host
   * composes it into the prompt every agent on the canvas is handed —
   * attributed to this module, because it is this module's claim rather than
   * the host's.
   *
   * Written as instructions to somebody who has just arrived and does not know
   * the notes exist, since that is exactly who reads it. Bounded at 1024
   * characters by the protocol, so every sentence here is one an agent that read
   * nothing else would still act correctly on.
   */
  guidance:
    'Somebody has written notes against passages of the documents here, and they are addressed to whoever edits '
    + 'next — you. Before changing a file, call `notes` with its path to see what is outstanding on it; a note you '
    + 'did not read is a note you are about to overwrite the reason for. Answer with `reply_to_note` and close with '
    + '`resolve_note` when you have actually done the thing, naming what you changed. Write your own with `add_note`, '
    + 'always quoting the exact passage — offsets rot the moment anything above them is edited, and the quote is the '
    + 'only thing that later tells a live anchor from one pointing at the wrong sentence. ADRIFT means the passage is '
    + 'gone: re-anchor it with `reanchor_note` or resolve it saying why. Notes marked as from the source are the '
    + 'author’s own \\todo{} and % annotations, lifted out of the .tex; after editing one call `read_source_notes` '
    + 'on that file. Never assume a note is stale because it is old.',
  entry: '/app',
  modes: [{ id: 'notes', label: 'Notes', scope: 'epic' }],
  mcp: {
    url: '/mcp',
    transport: 'http',
    about: 'Notes anchored to passages of a document, and whether each one still points at the words it was written about.',
  },
  extensions: { emits: [], consumes: [] },
  declares: {
    protocol: `>=${PROTOCOL} <${PROTOCOL + 1}`,
    uses: [],
    storage: true,
    prompt: false,
  },
  health: '/healthz',
})
