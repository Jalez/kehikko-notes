#!/usr/bin/env bash
#
# The one name every module ships this under, so a host that offers to start one
# has a script to run rather than a command line to build.
#
#   - No arguments. A registration names a directory and one script inside it,
#     never a command line: a string a host handed to a shell would make a
#     registration file a place to write shell.
#   - No port on the command line, and no `--strictPort`. Both used to be here,
#     and 7940 was written twice — once on the last line of this file and once in
#     `register.ts` — so moving this app meant two edits and then remembering
#     that the file in `~/.roadmap/modules` still named the old address. It is
#     said once now, beside the id, as `PREFERRED_PORT` in `manifest.ts`, and
#     `serves()` in `vite.config.ts` is what acts on it.
#
#     $PORT is still honoured, by the plugin rather than by this line, and for
#     the reason this bullet always gave: whoever starts this chose the port, and
#     a module that picked its own would answer somewhere nobody is looking. A
#     host passes the port from the registration when it spawns this script,
#     which is precisely the address it is about to go and look at.
#
#     What `--strictPort` bought was an app that DIED on a taken port —
#     `Error: Port 7940 is already in use`, exit 1 — rather than one answering
#     quietly somewhere else. That was the honest option while nothing handled a
#     collision. `serves()` handles it now: a free 7940 is taken in silence, this
#     module already answering there ends the start cleanly instead of putting a
#     second writer on one `notes.json`, and anything else is a loud move with
#     the registration rewritten to the port actually bound.
#   - `exec`, and the foreground. A script that forks and returns leaves whoever
#     started it holding a pid that stops nothing, and Stop is only ever offered
#     for what a host started.
#   - `cd` to this script's own directory, so `node_modules` and Vite's config
#     are found however the script was invoked. That used to be about the store
#     as well; it is not any more. The notes live in the project they are about
#     — `<projectPath>/.kehikot/notes/notes.json` — and this directory now holds only
#     the program. See `store.ts`.
#
# It does NOT register a module that had none. Registration is a deliberate act
# by a person — see `register.ts` — and a start script that quietly wrote into
# somebody's home directory would be doing it on their behalf. That argument is
# untouched: what the Vite plugin now writes on every start is this module's
# ADDRESS, which is a different sentence. The person decided to be framed; they
# did not decide to be framed at 7940 in particular, and a registration still
# naming a port this app has drifted off is one the host sweeps to find nothing.
#
# ## There is no build here, and no `dist`
#
# What `dist` buys is a STALE page served with a 200: every symptom of a working
# app and none of the changes. That failure has cost this codebase whole
# afternoons in three separate programs. A missing build announces itself; a
# stale one does not. So Vite serves the page, and the manifest, the health
# check, the MCP door and this app's own store are middleware in front of the
# same server — see `doors()` in `vite.config.ts` — because a module is one
# origin or it is nothing, and because a page that fetched its own notes from a
# second port would be fetching them cross-origin, which is to say not at all.
set -euo pipefail
cd "$(dirname "$0")"

# `NOTES_DATA` is gone, and its absence is the point rather than an omission.
#
# It named a directory beside this script holding one `notes.json` for every
# project at once. There is no such file now: the notes for a project are in
# that project, at `<projectPath>/.kehikot/notes/notes.json`, and the host says which
# project on every context change. A variable set at launch could only ever name
# ONE of them, which is the failure the protocol's `projectPath` was added to
# end — a host moving a person to another project while every module went on
# reading the first one, correctly, from the root it was handed at startup.
#
# So there is nothing to export here, and a deployment that still sets the old
# variable is simply ignored rather than quietly obeyed.

# Which directories this app may open a document from, in order to check whether
# a note's anchor still points at the words it was written about.
#
# Unset is a real and safe state: with no root, every anchor is reported
# UNCHECKED rather than assumed good, and the container says so on the row. The
# fallback when this is unset is the project's own directory as the HOST names
# it, which is the one place this app can be reasonably sure it was invited
# into. See `notes/source.ts` for why the check is realpath-based and what it
# refuses.
#
# Colon-separated, absolute paths only.
: "${NOTES_ROOTS:=}"
export NOTES_ROOTS

if [ ! -d node_modules ]; then
  echo "installing…" >&2
  bun install >&2
fi

exec bunx vite
