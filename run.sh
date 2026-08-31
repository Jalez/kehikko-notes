#!/usr/bin/env bash
#
# The one name every module ships this under, so a host that offers to start one
# has a script to run rather than a command line to build.
#
#   - No arguments. A registration names a directory and one script inside it,
#     never a command line: a string a host handed to a shell would make a
#     registration file a place to write shell.
#   - $PORT from the environment. Whoever starts this chose the port; a script
#     that picked its own would answer somewhere nobody is looking. 7940 is the
#     default and it is the number in the registration too — 7820 through 7930
#     belong to the other modules on this machine.
#   - `exec`, and the foreground. A script that forks and returns leaves whoever
#     started it holding a pid that stops nothing, and Stop is only ever offered
#     for what a host started.
#   - `cd` to this script's own directory, so `node_modules` and Vite's config
#     are found however the script was invoked. That used to be about the store
#     as well; it is not any more. The notes live in the project they are about
#     — `<projectPath>/.kehikot/notes/notes.json` — and this directory now holds only
#     the program. See `store.ts`.
#
# It does NOT register. Registration is a deliberate act by a person — see
# `register.ts` — and a start script that quietly wrote into somebody's home
# directory would be doing it on their behalf.
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
# UNCHECKED rather than assumed good, and the pane says so on the row. The
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

exec bunx vite --host 127.0.0.1 --port "${PORT:-7940}" --strictPort
