import * as React from "react"
import { Avatar as AvatarPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import {
  getAvatarMaskUrl,
  isValidAvatarShape,
  type AvatarShape,
} from "@/lib/avatarShape"

/**
 * Context so children (e.g. `AvatarFallback`) can inherit the avatar shape
 * and drop their own `rounded-full` when a custom shape is applied.
 */
const AvatarShapeContext = React.createContext<AvatarShape | undefined>(
  undefined
)

function Avatar({
  className,
  size = "default",
  shape,
  style,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> & {
  size?: "default" | "sm" | "lg"
  /** Optional emoji glyph (from kind-0 metadata) used as a CSS mask. */
  shape?: AvatarShape
}) {
  const hasCustomShape = !!shape && isValidAvatarShape(shape)
  // `getAvatarMaskUrl` renders the emoji to a canvas and caches the data-URL,
  // so repeated calls are cheap.
  const maskUrl = hasCustomShape ? getAvatarMaskUrl(shape) : ""

  const mergedStyle = React.useMemo<React.CSSProperties>(() => {
    if (maskUrl) {
      return {
        ...style,
        WebkitMaskImage: `url(${maskUrl})`,
        maskImage: `url(${maskUrl})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }
    }
    return style ?? {}
  }, [maskUrl, style])

  return (
    <AvatarShapeContext.Provider value={hasCustomShape ? shape : undefined}>
      <AvatarPrimitive.Root
        data-slot="avatar"
        data-size={size}
        className={cn(
          "group/avatar relative flex size-8 shrink-0 overflow-hidden select-none data-[size=lg]:size-10 data-[size=sm]:size-6",
          !hasCustomShape && "rounded-full",
          className
        )}
        style={mergedStyle}
        {...props}
      />
    </AvatarShapeContext.Provider>
  )
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  const shape = React.useContext(AvatarShapeContext)
  const hasCustomShape = !!shape && isValidAvatarShape(shape)
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center bg-muted text-sm text-muted-foreground group-data-[size=sm]/avatar:text-xs",
        !hasCustomShape && "rounded-full",
        className
      )}
      {...props}
    />
  )
}

function AvatarBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background select-none",
        "group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
        "group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
        "group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2",
        className
      )}
      {...props}
    />
  )
}

function AvatarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        "group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
        className
      )}
      {...props}
    />
  )
}

function AvatarGroupCount({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3",
        className
      )}
      {...props}
    />
  )
}

export {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarBadge,
  AvatarGroup,
  AvatarGroupCount,
}
