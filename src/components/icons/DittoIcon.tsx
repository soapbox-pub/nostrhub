import type { SVGProps } from 'react';

/**
 * Planet icon from Ditto — used as the Ditto theme icon.
 * Lucide-style stroke SVG (no fill, currentColor stroke). Follows the React 19
 * convention of forwarding `ref` as a normal prop.
 */
export function DittoIcon({
  className,
  strokeWidth = 2,
  ref,
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M4.05 13c-1.7 1.8-2.5 3.5-1.8 4.5c1.1 1.9 6.4 1 11.8-2s8.9-7.1 7.7-9c-.6-1-2.4-1.2-4.7-.7" />
    </svg>
  );
}
