import { describe, expect, test } from 'bun:test'

import { ROOMY, linesInFrame, roomFor, snappable } from '../notes/room.ts'

/**
 * What a container this size is allowed to draw.
 *
 * The sizes below are the ones a canvas actually hands out — the person who
 * asked for this named them: "often 220–500px wide and sometimes only
 * 150–300px tall" — and the assertions are about the DECISION rather than the
 * pixels it leads to. A test that measured a rendered row would be a test that
 * breaks when somebody changes a font size, and would still not say whether the
 * rule was right.
 */

const canvas = { width: 220, height: 300 }
const strip = { width: 320, height: 200 }
const middling = { width: 460, height: 360 }
const page = { width: 900, height: 700 }

describe('a small container shows less, never something else', () => {
  test('a narrow one is compact', () => {
    expect(roomFor(canvas).compact).toBe(true)
  })

  test('a short one is compact however wide it is', () => {
    /* Either axis is enough. A row needs width for prose to be prose, and
       height for the eight things under the body to be worth eight lines. */
    expect(roomFor({ width: 900, height: 200 }).compact).toBe(true)
  })

  test('a container with room for four notes draws them whole', () => {
    const room = roomFor(page)
    expect(room.compact).toBe(false)
    expect(room.where).toBe(true)
    expect(room.author).toBe(true)
    expect(room.said).toBe(true)
    expect(room.actions).toBe(true)
    expect(room.provenance).toBe(true)
    expect(room.notices).toBe(true)
    expect(room.bodyLines).toBeNull()
  })

  test('nothing is dropped out of order: what a compact row drops, it drops together', () => {
    const room = roomFor(strip)
    for (const shown of [room.where, room.author, room.said, room.actions, room.provenance, room.notices]) {
      expect(shown).toBe(false)
    }
  })

  test('a row that fits the frame is a row that can carry a snap point', () => {
    /*
     * The two halves of "one note fully" have to agree, and this is where they
     * are checked against each other rather than in a browser. A body clamped
     * to `bodyLines`, plus the 39 pixels of chrome above it, must come out at
     * or under the scroller's own height — otherwise `snappable` takes the
     * row's snap point away and a flick lands part-way into a note, which is
     * the failure being fixed.
     */
    for (const frame of [canvas, strip, middling]) {
      const lines = roomFor(frame).bodyLines
      expect(lines).not.toBeNull()
      const row = 39 + (lines ?? 0) * 20
      const view = frame.height - 40
      expect(snappable(row, view)).toBe(true)
    }
  })

  test('the words themselves are never dropped, only clamped', () => {
    /* Every other field can go. The body is what somebody wrote down and the
       quote is what they wrote it about, and a row without either is a row
       with nothing on it. */
    expect(roomFor(canvas).bodyLines).toBeGreaterThan(0)
    expect(roomFor(canvas).quoteLines).toBeGreaterThan(0)
  })

  test('a note gets as many lines as the frame holds, not as many as fit three rows', () => {
    /*
     * The owner: "when there's not enough space in notes — instead of trying to
     * squeeze as many notes visible at once, it should focus on showing one
     * note fully."
     *
     * The rule this replaced was two lines under 320 pixels and three above,
     * numbers chosen to fit three rows into a 300-pixel box. They did:
     * `dev/sizes.mjs` reported three notes fully on screen at 220x300 and that
     * was recorded as the win. Every one of the three was two lines of a note
     * that wanted twenty. The probe counts `whole` now — on screen AND not
     * truncated — and the old layout measured `fully: 3, whole: 0`.
     *
     * The table below is the arithmetic, not the pixels: 20 for a line of
     * `text-sm`, 39 for a row's badge line and padding, 40 for the heading
     * above the scroller. All three were measured, and the row that comes out
     * is one frameful — 259 pixels in a 264-pixel window at 220x300, which is
     * also the condition `snappable` needs.
     */
    expect(roomFor({ width: 220, height: 300 }).bodyLines).toBe(11)
    expect(roomFor(strip).bodyLines).toBe(6)
    expect(roomFor(middling).bodyLines).toBe(14)
  })

  test('a container with height to spare draws a whole note even when it is narrow', () => {
    /* Narrow is still compact — the path, the author and the four buttons are
       still dropped — but there is no reason to truncate anybody's words in a
       900-pixel column, and the old rule clamped them to three lines there. */
    expect(roomFor({ width: 220, height: 900 }).compact).toBe(true)
    expect(roomFor({ width: 220, height: 900 }).bodyLines).toBe(41)
  })

  test('and the smallest box anybody can drag still gets a note rather than a line', () => {
    /* Below the point where two lines fit, the arithmetic goes negative. Two
       lines and an honest scroll beats one line, and beats zero. */
    expect(linesInFrame(150)).toBe(3)
    expect(linesInFrame(80)).toBe(2)
    expect(linesInFrame(0)).toBe(2)
  })

  test('a caller that measured nothing draws everything', () => {
    /* The default a component falls back to. Silently hiding half a note
       because nobody said how big the box was is the one failure mode that
       would be invisible in every test that did not look for it. */
    expect(ROOMY.compact).toBe(false)
    expect(ROOMY.bodyLines).toBeNull()
    expect(ROOMY.compose).toBe('inline')
  })
})

describe('where a note gets written', () => {
  test('the whole frame, in a container a form would fill anyway', () => {
    expect(roomFor(canvas).compose).toBe('fill')
    expect(roomFor(strip).compose).toBe('fill')
    expect(roomFor(middling).compose).toBe('fill')
  })

  test('and a strip above the list where the list survives it', () => {
    expect(roomFor(page).compose).toBe('inline')
  })

  test('narrow is enough on its own, however tall the container is', () => {
    /* A textarea 220 pixels wide in a column beside a list is not a place
       anybody writes a paragraph, and the height it has does not change that. */
    expect(roomFor({ width: 220, height: 900 }).compose).toBe('fill')
  })
})

describe('snapping is for a container that cannot show the list', () => {
  test('on where two or three notes fit', () => {
    expect(roomFor(canvas).snap).toBe(true)
    expect(roomFor(middling).snap).toBe(true)
  })

  test('off where a reader can already see four', () => {
    /* Not a nicety: a scroller that keeps aligning rows a reader can already
       see reads as a scroller that will not let go. */
    expect(roomFor(page).snap).toBe(false)
  })

  test('a row that fits may carry a snap point', () => {
    expect(snappable(80, 300)).toBe(true)
    expect(snappable(300, 300)).toBe(true)
  })

  test('and a row taller than the window may not', () => {
    /* Its snap point would sit at its own start, and proximity would pull a
       reader back to it every time they tried to read the bottom of it. */
    expect(snappable(700, 300)).toBe(false)
  })

  test('nothing measured yet is not a snap point either', () => {
    expect(snappable(0, 300)).toBe(false)
    expect(snappable(80, 0)).toBe(false)
  })
})
