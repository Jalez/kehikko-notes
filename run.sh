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
#   - `cd` to this script's own directory, so this app's store is beside the
#     program however it was invoked. That is not a detail here: `data/` holds
#     every note anybody wrote, and the whole claim of the module is that the
#     directory can be copied to another machine and run.
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

# Said out loud rather than left to a default, and the reason is in `store.ts`:
# Vite bundles its own config into `node_modules/.vite-temp/`, so anything in
# that graph asking where it lives gets the wrong answer — or, under Node,
# `undefined`. Naming the directory here is the one place that cannot be moved
# by a bundler, and it is `$PWD` because of the `cd` above, so the store is
# beside this script however the script was invoked. Somebody who has already
# set the variable keeps their own answer.
export NOTES_DATA="${NOTES_DATA:-$PWD/data}"

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
