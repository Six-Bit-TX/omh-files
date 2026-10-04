/**
 * Glyphs this package draws that the shared icon set does not carry yet.
 * Same props contract as `@deepseek-ai/dsh-client-ui-primitives` icons, so a
 * shared replacement is a one-line import change.
 */
import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'

/** An arrow leaving a tray: a file is going out to the tree. */
export const IconUploadOutline16 = ({ size = 16, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M11 4H13V11H16L12 15.5L8 11H11V4ZM4 17H6V19H18V17H20V19C20 20.1046 19.1046 21 18 21H6C4.89543 21 4 20.1046 4 19V17Z"
      fill="currentColor"
    />
  </svg>
)
