// money-hub patch: the icon of an asset or a liability (owner, 10-03: "add icon support for Assets
// and liabilities and show it everywhere reference it"). A picture the owner picks (a photo of the
// house, the bank's logo on a loan) is stored like a security's custom logo (asset_logos, by asset
// id, components/alt-asset-icon-dialog.tsx) and drawn with RoundLogo, edge to edge, the one way the
// app draws a logo. Without one, the kind's own drawing shows, as before. Every place that shows a
// house, a car or a loan by name draws it through here, so a new picture shows everywhere at once.
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import type { ReactNode } from "react";

import { RoundLogo } from "@/components/round-logo";
import { useAssetLogoOverride } from "@/lib/asset-logo-registry";
import { cn } from "@/lib/utils";

/** The kind's drawing (duotone), for the API's lowercase kinds and the form's uppercase ones. */
export function AltAssetKindIcon({
  kind,
  size = 20,
  className,
}: {
  kind?: string | null;
  size?: number;
  className?: string;
}) {
  switch ((kind ?? "").toLowerCase()) {
    case "property":
      return <Icons.RealEstateDuotone size={size} className={className} />;
    case "vehicle":
      return <Icons.VehicleDuotone size={size} className={className} />;
    case "collectible":
      return <Icons.CollectibleDuotone size={size} className={className} />;
    case "precious":
    case "precious_metal":
      return <Icons.PreciousDuotone size={size} className={className} />;
    case "liability":
      return <Icons.LiabilityDuotone size={size} className={className} />;
    default:
      return <Icons.OtherAssetDuotone size={size} className={className} />;
  }
}

/** The owner's picture for this asset: `has` as soon as one is saved, `url` once its bytes are in. */
export function useAltAssetIcon(assetId?: string | null): { has: boolean; url?: string } {
  // By id only: an asset's display code ("Mortgage", "Rental") is shared by every asset of its type.
  const override = useAssetLogoOverride({ assetId: assetId || undefined });
  return { has: !!override.ref, url: override.dataUri };
}

interface AltAssetIconProps {
  assetId?: string | null;
  kind?: string | null;
  name?: string;
  /** Size and shape, default `h-10 w-10` round; `rounded-[10px]` makes the Meadow cards' tile. */
  className?: string;
  /** The kind drawing's size when there is no picture. */
  iconSize?: number;
  /** A not yet saved picture (the Add window), shown instead of the saved one. */
  src?: string;
  /** What shows without a picture; default the kind's drawing on a muted circle. */
  fallback?: ReactNode;
}

export function AltAssetIcon({
  assetId,
  kind,
  name,
  className = "h-10 w-10",
  iconSize = 20,
  src,
  fallback,
}: AltAssetIconProps) {
  const icon = useAltAssetIcon(src ? undefined : assetId);
  const url = src ?? icon.url;
  if (url) return <RoundLogo url={url} name={name} className={cn("shrink-0", className)} />;
  // Saved but its bytes are still on the way: the same circle, empty, so no drawing flashes first.
  if (icon.has)
    return <span aria-hidden className={cn("bg-muted shrink-0 rounded-full", className)} />;
  if (fallback !== undefined) return <>{fallback}</>;
  return (
    <div
      className={cn("bg-muted flex shrink-0 items-center justify-center rounded-full", className)}
    >
      <AltAssetKindIcon kind={kind} size={iconSize} />
    </div>
  );
}

/** The icon with a hover cover (a small badge on touch screens) that opens the icon window. */
export function EditableAltAssetIcon({
  onEdit,
  className = "size-9",
  ...icon
}: Omit<AltAssetIconProps, "className"> & { className?: string; onEdit: () => void }) {
  return (
    <div className={cn("group relative shrink-0", className)}>
      <AltAssetIcon {...icon} className="size-full" />
      <button
        type="button"
        aria-label="Change icon"
        title="Change icon"
        onClick={onEdit}
        className="focus-visible:ring-ring absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 group-hover:opacity-100"
      >
        <Icons.ImageUp className="size-3.5" />
      </button>
      <span
        aria-hidden="true"
        className="bg-background text-muted-foreground pointer-coarse:block pointer-events-none absolute -bottom-0.5 -right-0.5 hidden rounded-full border p-0.5"
      >
        <Icons.ImageUp className="size-2.5" />
      </span>
    </div>
  );
}
