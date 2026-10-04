import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { cn } from "@/lib/utils";

interface PrivacyToggleProps {
  className?: string;
}

export function PrivacyToggle({ className }: PrivacyToggleProps) {
  const { isBalanceHidden, toggleBalanceVisibility } = useBalancePrivacy();

  return (
    <Button
      variant="secondary"
      size="icon-xs"
      className={cn("bg-secondary/50 rounded-full", className)}
      onClick={(e) => {
        e.stopPropagation();
        toggleBalanceVisibility();
      }}
    >
      {isBalanceHidden ? <Icons.Eye className="size-5" /> : <Icons.EyeOff className="size-5" />}
    </Button>
  );
}

/** The floating bar's eye: a round button like its others; the icon is what a press does (as on PrivacyToggle). */
export function FloatingPrivacyButton({ className }: { className?: string }) {
  const { isBalanceHidden, toggleBalanceVisibility } = useBalancePrivacy();
  const label = isBalanceHidden ? "Show numbers" : "Hide numbers";
  return (
    <button type="button" onClick={toggleBalanceVisibility} title={label} aria-label={label} className={className}>
      <span aria-hidden="true" className="relative flex size-7 shrink-0 items-center justify-center">
        {isBalanceHidden ? <Icons.Eye className="size-6" /> : <Icons.EyeOff className="size-6" />}
      </span>
    </button>
  );
}
