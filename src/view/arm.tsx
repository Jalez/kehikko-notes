import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button.tsx'
import { cn } from '@/lib/utils.ts'

/**
 * A press that has to be made twice, with what it would do said in between.
 *
 * This is `Arm` from `kehikko-history/src/view/arm.tsx`, carried over rather
 * than imported because modules share a protocol and not a component library,
 * and cut to what one press here needs. The argument is that file's and is
 * repeated because it is load-bearing:
 *
 * ## Why not `window.confirm()`
 *
 * Because it does not work here, and it fails in the worst possible way. A
 * host frames a module in a sandboxed iframe, and this workspace's host does
 * not include `allow-modals`. In that sandbox `confirm()` does not throw and
 * does not open anything: it **silently returns `false`**. So a button guarded
 * by one is a button that does nothing, forever, with nothing in the console
 * and nothing on screen. A person presses it, watches nothing happen, presses
 * it again, and concludes the module is broken. `alert()` and `prompt()` are
 * the same. Nothing in this module may use any of them.
 *
 * ## What an arm is instead
 *
 * The first press changes the button: it says what will happen, in the words
 * of the specific thing about to happen, and it looks different — a red
 * border, not only a red word, because a person scanning a pane reads shape
 * before text. The second press does it. Anywhere else, or eight seconds,
 * disarms it. The eight seconds matter: an armed button left armed is a trap
 * for whoever comes back to the pane and presses what they think is a fresh
 * button.
 *
 * ## `warning` is the sentence, and it is the caller's job
 *
 * A generic "are you sure?" is exactly the prompt people learn to press
 * through. What is passed in names the actual thing: this note, and how many
 * replies go with it.
 *
 * ## The resting state is an icon, the armed state is words
 *
 * At rest the button is the icon alone with `label` as its accessible name.
 * Once armed it goes back to words, deliberately: the armed state is the one a
 * person must read before pressing again, and an icon that has quietly become
 * dangerous is the trap the two-press pattern exists to avoid.
 */
export function Arm({
  label,
  icon,
  armed: armedLabel,
  warning,
  onFire,
  disabled,
  className,
}: {
  /** The accessible name at rest, and the tooltip. */
  label: string
  /** Drawn at rest instead of the label. */
  icon: ReactNode
  /** What it says once armed. A verb about the specific act. */
  armed: string
  /** What would happen, in specifics. Shown only while armed. */
  warning: string
  onFire: () => void
  disabled?: boolean
  className?: string
}) {
  const [armed, setArmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const disarm = useCallback(() => {
    setArmed(false)
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  /* Disarmed by a press anywhere else on the page. Without this the only way to
     un-arm is to wait, and a person who has changed their mind has no way to
     say so. */
  useEffect(() => {
    if (!armed) return
    const elsewhere = () => disarm()
    document.addEventListener('pointerdown', elsewhere, { capture: true })
    return () => document.removeEventListener('pointerdown', elsewhere, { capture: true })
  }, [armed, disarm])

  return (
    <span className={cn('inline-flex min-w-0 flex-col items-end gap-1', className)}>
      <Button
        type="button"
        size={armed ? 'container' : 'containerIcon'}
        variant={armed ? 'outline' : 'ghost'}
        aria-label={armed ? undefined : label}
        title={armed ? undefined : label}
        data-armed={armed ? '1' : undefined}
        disabled={disabled}
        className={cn(armed && 'border-adrift/60 text-adrift')}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => {
          if (!armed) {
            setArmed(true)
            timer.current = setTimeout(() => setArmed(false), 8000)
            return
          }
          disarm()
          onFire()
        }}
      >
        {armed ? armedLabel : icon}
      </Button>
      {armed ? (
        <span
          role="alert"
          className="min-w-0 rounded border border-adrift/40 bg-adrift/5 px-1.5 py-1 text-right text-[0.65rem] leading-4 text-adrift"
        >
          {warning}
        </span>
      ) : null}
    </span>
  )
}
