import * as React from "react";
import { useTranslation } from "react-i18next";
import { useIsMobile as defaultUseIsMobile } from "../../hooks/use-mobile";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Icons } from "./icons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./sheet";

export interface ResponsiveSelectOption {
  value: string;
  label: string;
  description?: string;
  /** Shown before the label (money-hub: a house's or a loan's icon). */
  icon?: React.ReactNode;
}

interface ResponsiveSelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  options: ResponsiveSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  triggerClassName?: string;
  contentClassName?: string;
  sheetTitle?: string;
  sheetDescription?: string;
  mobileSide?: React.ComponentProps<typeof SheetContent>["side"];
  displayMode?: "auto" | "desktop" | "mobile";
  useIsMobile?: () => boolean;
}

export function ResponsiveSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select an option",
  disabled,
  triggerClassName,
  contentClassName,
  sheetTitle = "Select Option",
  sheetDescription,
  mobileSide = "bottom",
  displayMode = "auto",
  useIsMobile,
}: ResponsiveSelectProps) {
  const { t } = useTranslation();
  const useIsMobileHook = useIsMobile ?? defaultUseIsMobile;
  const isMobile = displayMode === "mobile" || (displayMode === "auto" && useIsMobileHook());
  const [open, setOpen] = React.useState(false);

  const selectedOption = React.useMemo(() => options.find((option) => option.value === value), [options, value]);

  const handleSelect = (nextValue: string) => {
    onValueChange?.(nextValue);
    if (isMobile) {
      setOpen(false);
    }
  };

  if (isMobile) {
    const displayText = selectedOption ? selectedOption.label : placeholder;

    return (
      <>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-between truncate rounded-md font-normal",
            !selectedOption && "text-muted-foreground",
            triggerClassName,
          )}
          onClick={() => setOpen(true)}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selectedOption?.icon}
            <span className="truncate">{displayText}</span>
          </span>
          <Icons.ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>

        {/* money-hub patch (owner, 10-04: "never anything waste of screen space"): the sheet is as tall as its
            list (it was a fixed 80vh with 12px-padded cards), rows are 40px, the list scrolls only when it must. */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side={mobileSide} className="rounded-t-4xl mx-1 flex max-h-[80dvh] flex-col gap-0 p-0">
            <SheetHeader className="border-border border-b px-4 pb-2 pt-3">
              <SheetTitle className="text-base">{sheetTitle}</SheetTitle>
              {sheetDescription ? <SheetDescription>{sheetDescription}</SheetDescription> : null}
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] pt-2">
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelect(option.value)}
                    className={cn(
                      "flex min-h-10 w-full items-center justify-between gap-3 rounded-lg border border-transparent px-3 py-1.5 text-left transition-colors",
                      isSelected
                        ? "border-primary bg-primary/10 text-primary"
                        : "hover:bg-accent active:bg-accent/80 focus:border-primary focus:outline-none",
                    )}
                  >
                    {option.icon}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-medium">{option.label}</div>
                      {option.description ? (
                        <div className="text-muted-foreground truncate text-xs">{option.description}</div>
                      ) : null}
                    </div>
                    {isSelected ? <Icons.Check className="h-4 w-4 shrink-0" /> : null}
                  </button>
                );
              })}

              {options.length === 0 ? (
                <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-8 text-sm">
                  <Icons.Search className="h-8 w-8 opacity-20" />
                  <span>{t("ui:search.noOptions", "No options available.")}</span>
                </div>
              ) : null}
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Select value={value} onValueChange={handleSelect} disabled={disabled}>
      <SelectTrigger className={cn("w-full", triggerClassName)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.icon ? (
              <div className="flex items-center gap-2">
                {option.icon}
                <div className="flex flex-col">
                  <span>{option.label}</span>
                  {option.description ? (
                    <span className="text-muted-foreground text-xs">{option.description}</span>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex flex-col">
                <span>{option.label}</span>
                {option.description ? (
                  <span className="text-muted-foreground text-xs">{option.description}</span>
                ) : null}
              </div>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
