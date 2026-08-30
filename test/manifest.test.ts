import { describe, expect, test } from 'bun:test'
import { LIMITS, MANIFEST_KIND, PROTOCOL, manifestSchema, speaks } from 'roadmap-module-protocol'

import { ID, MANIFEST, VERSION } from '../manifest.ts'

/**
 * The only half of this program a host ever reads.
 *
 * Every assertion here is about something whose failure is SILENT: a manifest a
 * host quietly declines, a capability declared and never used, a guidance
 * paragraph the protocol will refuse for being a document. None of them errors
 * where the author can see it.
 */

describe('a host can read this', () => {
  test('it is a manifest, of the protocol this app was written against', () => {
    expect(manifestSchema.safeParse(MANIFEST).success).toBe(true)
    expect(MANIFEST.kind).toBe(MANIFEST_KIND)
    expect(MANIFEST.protocol).toBe(PROTOCOL)
    expect(MANIFEST.id).toBe(ID)
    expect(MANIFEST.version).toBe(VERSION)
  })

  test('the range it declares includes the protocol it declares, which is not automatic', () => {
    expect(speaks(MANIFEST.declares.protocol, PROTOCOL)).toBe(true)
    expect(speaks(MANIFEST.declares.protocol, PROTOCOL + 1)).toBe(false)
  })
})

describe('what it asks for', () => {
  test('nothing, and that is the point — this module consumes a context and asks no questions', () => {
    expect(MANIFEST.declares.uses).toEqual([])
  })

  test('passage:set is NOT declared: this app reads a passage and never sets one', () => {
    expect(MANIFEST.declares.uses).not.toContain('passage:set')
    expect(MANIFEST.declares.uses).not.toContain('selection:set')
  })

  test('storage IS declared, which is what lets the page keep its own origin', () => {
    /* Without it the host frames this page opaque, its own `/api` fetches become
       cross-origin, and the only way to make them work is a permissive CORS
       header that hands `/app` — and the write ticket in it — to any tab.
       See the essays in `manifest.ts` and `vite.config.ts`. */
    expect(MANIFEST.declares.storage).toBe(true)
  })

  test('no prompt is offered, because there is no work here that has to be described first', () => {
    expect(MANIFEST.declares.prompt).toBe(false)
  })
})

describe('what it tells an agent it obliges', () => {
  test('it fits in the paragraph the protocol allows, which a document would not', () => {
    expect(MANIFEST.guidance).toBeDefined()
    expect((MANIFEST.guidance ?? '').length).toBeLessThanOrEqual(LIMITS.GUIDANCE)
  })

  test('it names the tools by the names the door actually answers to', () => {
    const said = MANIFEST.guidance ?? ''
    for (const tool of ['notes', 'add_note', 'reply_to_note', 'resolve_note', 'reanchor_note']) {
      expect(said).toContain(tool)
    }
  })

  test('and it says the thing this module exists to say, rather than describing a panel', () => {
    const said = MANIFEST.guidance ?? ''
    expect(said).toContain('quoting')
    expect(said).toContain('ADRIFT')
  })
})

describe('the mode', () => {
  test('is epic-scoped, because that is the mode a context — and therefore a passage — reaches', () => {
    expect(MANIFEST.modes).toHaveLength(1)
    expect(MANIFEST.modes[0]?.scope).toBe('epic')
  })
})

describe('the doors it names', () => {
  test('are relative to this module’s own origin, which is what a module IS', () => {
    expect(MANIFEST.entry).toBe('/app')
    expect(MANIFEST.health).toBe('/healthz')
    expect(MANIFEST.mcp?.url).toBe('/mcp')
  })
})
