import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '@/lib/utils.ts'

/**
 * shadcn's badge, used here for exactly one thing: WHAT HAS BECOME OF AN
 * ANCHOR.
 *
 * Five words — still there, moved, adrift, unchecked, whole page — and they are
 * not decoration. They are this module's entire claim, said on the row it
 * applies to: a note whose anchor still holds and a note whose passage has been
 * rewritten look identical in every other respect, and a reader who cannot tell
 * them apart reads a pile of quotations and believes all of them equally.
 *
 * ## The trap in the base class, and why it is kept anyway
 *
 * `whitespace-nowrap` is in shadcn's base and it is deliberate at 220px: a badge
 * that wraps to two lines reads as two badges. It is also exactly the property
 * that has already set a 1187-pixel min-content floor under a 220-pixel container
 * elsewhere in this workspace, because something long was put inside one.
 *
 * The rule that follows is not "remove the class". It is: **nothing variable
 * ever goes in a badge here.** Every string below is a fixed word this file
 * chose. A quoted passage, a document path, an author's name — anything whose
 * length is somebody else's decision — is drawn as prose, where `overflow-wrap:
 * anywhere` in `index.css` applies to it. `shrink-0` keeps the badge from being
 * squeezed by that prose; `max-w-full` is the belt to its braces, so that even a
 * word this file got wrong cannot push the row wider than the container.
 */
const badgeVariants = cva(
  'inline-flex max-w-full shrink-0 items-center rounded border px-1.5 py-px text-[0.65rem] font-medium leading-4 whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-muted text-muted-foreground',
        outline: 'text-muted-foreground',
        exact: 'border-exact/40 text-exact',
        moved: 'border-moved/50 text-moved',
        adrift: 'border-adrift/50 text-adrift',
        unchecked: 'border-unchecked/40 text-unchecked',
        unranged: 'border-unranged/40 text-unranged',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
