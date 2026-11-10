/**
 * `kehikot.rows.json`, for `kehikot-check-rows` (protocol 2.70.0): the header and footer this page
 * declares, built by the page's own `headerItems` and `footerItems` over a few moments of the list.
 * `bun run rows` writes the file; `test/rows.test.ts` fails when it no longer matches.
 */
import { footerItems, headerItems, type FooterState } from '../src/wire/footer.ts'

const base: FooterState = {
  scope: { said: 'this passage', title: 'paper/main.tex' },
  climbs: [{ id: 'document', said: 'All of main.tex' }],
  shown: 3,
  adrift: 0,
  elsewhere: 4,
  withdrawn: 0,
  withdrawnShown: false,
  verified: true,
  pointed: null,
  refused: null,
  busy: false,
}

export function rowsStates() {
  return [
    {
      name: 'the notes on a passage',
      header: headerItems({ canWrite: true, composing: false, busy: false }),
      footer: footerItems(base),
      state: true,
    },
    {
      name: 'every note in the project, one pointed at, saving, some adrift and unchecked',
      header: headerItems({ canWrite: false, composing: false, busy: true }),
      footer: footerItems({
        ...base,
        scope: { said: 'everything', title: null },
        climbs: [{ id: 'follow', said: 'Follow the reader' }],
        adrift: 2,
        withdrawn: 1,
        verified: false,
        pointed: 'the quoted words',
        busy: true,
      }),
      state: true,
    },
    {
      name: 'the store refused',
      header: headerItems({ canWrite: false, composing: false, busy: false }),
      footer: footerItems({ ...base, scope: null, shown: null, climbs: [], refused: 'The store would not read this project.' }),
      state: true,
    },
  ]
}

export const ROWS_PATH = new URL('../kehikot.rows.json', import.meta.url)
export const rowsText = () => `${JSON.stringify(rowsStates(), null, 2)}\n`

if (import.meta.main) await Bun.write(ROWS_PATH, rowsText())
