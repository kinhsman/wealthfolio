import { Icons } from "@wealthfolio/ui/components/ui/icons";

import type { Activity, ActivityDetails } from "@/lib/types";
import { ActivityType } from "@/lib/constants";
import { HOVER_SLOT } from "@/lib/hover-slot";
import { cn } from "@/lib/utils";
import { ActionPalette, type ActionPaletteGroup } from "@/components/action-palette";
import { Row } from "@tanstack/react-table";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityDetailSheet } from "./activity-detail-sheet";

export interface ActivityOperationsProps<TData> {
  row?: Row<TData>;
  activity?: ActivityDetails;
  onEdit: (activity: ActivityDetails) => void | undefined;
  onDelete: (activity: ActivityDetails) => void | undefined;
  onDuplicate: (activity: ActivityDetails) => void | undefined | Promise<void> | Promise<Activity>;
  onLinkTransfer?: (activity: ActivityDetails) => void | undefined;
  onUnlinkTransfer?: (activity: ActivityDetails) => void | undefined;
  /**
   * A borderless trigger for touch. The menu itself is the same compact one
   * everywhere (components/action-palette.tsx), on a phone and a desktop alike.
   */
  touch?: boolean;
  /**
   * Keeps the trigger out of the way until its row is hovered or focused, the
   * way the spending table's rows do. Opt-in: the row must carry `group/row`,
   * and a caller that does not — the data grid — would hide the menu for good.
   */
  hoverReveal?: boolean;
}

export function ActivityOperations<TData>({
  row,
  activity: activityProp,
  onEdit,
  onDelete,
  onDuplicate,
  onLinkTransfer,
  onUnlinkTransfer,
  touch = false,
  hoverReveal = false,
}: ActivityOperationsProps<TData>) {
  const { t } = useTranslation();
  const activity = activityProp ?? (row?.original as ActivityDetails);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isTransfer =
    activity.activityType === ActivityType.TRANSFER_IN ||
    activity.activityType === ActivityType.TRANSFER_OUT;
  const isNew = (activity as ActivityDetails & { isNew?: boolean }).isNew === true;
  const canShowTransferActions = isTransfer && !isNew && (onLinkTransfer || onUnlinkTransfer);

  const groups: ActionPaletteGroup[] = [
    {
      items: [
        {
          icon: Icons.Info,
          label: t("activity:operations.more_details"),
          onClick: () => setDetailSheetOpen(true),
        },
      ],
    },
    {
      items: [
        { icon: Icons.Pencil, label: t("activity:edit"), onClick: () => onEdit(activity) },
        { icon: Icons.Copy, label: t("activity:duplicate"), onClick: () => onDuplicate(activity) },
        ...(canShowTransferActions
          ? activity.sourceGroupId
            ? onUnlinkTransfer
              ? [
                  {
                    icon: Icons.Unlink,
                    label: t("activity:operations.unlink_transfer"),
                    onClick: () => onUnlinkTransfer(activity),
                  },
                ]
              : []
            : onLinkTransfer
              ? [
                  {
                    icon: Icons.Link,
                    label: t("activity:operations.link_transfer"),
                    onClick: () => onLinkTransfer(activity),
                  },
                ]
              : []
          : []),
      ],
    },
    {
      items: [
        {
          icon: Icons.Trash,
          label: t("activity:delete"),
          onClick: () => onDelete(activity),
          variant: "destructive" as const,
        },
      ],
    },
  ];

  const trigger = (
    <button
      type="button"
      className={cn(
        "hover:bg-muted flex items-center justify-center rounded-md transition-colors",
        touch ? "-mr-1 h-7 w-7 shrink-0" : hoverReveal ? "h-7 w-7" : "h-8 w-8 border",
        // Stays put once the menu is open, or it would vanish the moment the
        // pointer moved off the row and onto the menu itself.
        !touch && hoverReveal && cn("data-[state=open]:opacity-100", HOVER_SLOT),
      )}
    >
      <Icons.MoreVertical className="h-4 w-4" />
      <span className="sr-only">{t("activity:open_menu")}</span>
    </button>
  );

  return (
    <>
      <ActionPalette open={menuOpen} onOpenChange={setMenuOpen} groups={groups} trigger={trigger} />

      <ActivityDetailSheet
        activity={activity}
        open={detailSheetOpen}
        onOpenChange={setDetailSheetOpen}
      />
    </>
  );
}
