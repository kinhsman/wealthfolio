import { useHapticFeedback } from "@/hooks";
import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@wealthfolio/ui/components/ui/dropdown-menu";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import * as React from "react";

export interface ActionPaletteItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  testId?: string;
  variant?: "default" | "destructive";
}

export interface ActionPaletteGroup {
  title?: string;
  items: ActionPaletteItem[];
}

interface ActionPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names the menu for screen readers only: the button that opened it already says what it is. */
  title?: string;
  groups: ActionPaletteGroup[];
  trigger?: React.ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
}

/**
 * money-hub patch (owner, 10-04: "I like the compact version", "never anything waste of screen space"):
 * the row/page action menu is the app's ONE compact dropdown (ui/dropdown-menu.tsx), on a phone and on
 * a desktop alike. It used to be its own touch-sized popover (20px icons, 48px rows, a rule between every
 * row, a header with a close button), so the same kind of menu looked different from page to page, and
 * the theme's glass, which keys on `.bg-popover`, never reached it. A group is a divider and nothing
 * else; a group title is a small muted line, and only when the group has one.
 */
export function ActionPalette({
  open,
  onOpenChange,
  title,
  groups,
  trigger,
  align = "end",
  side = "bottom",
}: ActionPaletteProps) {
  const { triggerHaptic } = useHapticFeedback();

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="icon" className="h-9 w-9">
            <Icons.DotsThreeVertical className="h-5 w-5" weight="fill" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} aria-label={title}>
        {groups.map((group, groupIndex) => (
          <React.Fragment key={groupIndex}>
            {groupIndex > 0 && <DropdownMenuSeparator />}
            {group.title && (
              <DropdownMenuLabel className="text-muted-foreground py-1 text-xs font-medium">
                {group.title}
              </DropdownMenuLabel>
            )}
            {group.items.map((item, itemIndex) => (
              <DropdownMenuItem
                key={itemIndex}
                data-testid={item.testId}
                variant={item.variant}
                onSelect={() => {
                  triggerHaptic();
                  item.onClick();
                }}
              >
                <item.icon />
                {item.label}
              </DropdownMenuItem>
            ))}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
