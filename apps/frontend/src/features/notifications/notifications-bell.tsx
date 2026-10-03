// money-hub patch: the bell (owner, 2026-10-02, with a picture of Monarch's notification panel: "monarch has
// this notification panel which users can clear manually"). Every alert sent to Discord and the phone is
// listed here too: new ones counted on the bell, read once the panel has shown them, cleared one by one
// or all at once. In the sidebar, the floating bar (a panel beside or above it) and the phone's bar (a sheet).
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Icons, Sheet, SheetContent, SheetTitle } from "@wealthfolio/ui";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@wealthfolio/ui/components/ui/popover";
import { cn } from "@/lib/utils";
import { INBOX_KEY, badgeText, inboxApi, timeAgo, useInbox, type InboxItem, type InboxView } from "./inbox";

type Variant = "sidebar" | "floating" | "mobile";

function Count({ n, className }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span
      className={cn(
        "bg-primary text-primary-foreground inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none tabular-nums",
        className,
      )}
    >
      {badgeText(n)}
    </span>
  );
}

function Picture({ src }: { src: string | null }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-full">
        <Icons.Bell className="text-muted-foreground size-4" />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      onError={() => setBroken(true)}
      className="ring-border size-9 shrink-0 rounded-full bg-white object-contain p-[3px] ring-1"
    />
  );
}

function Row({ item, phone, onOpen, onRemove }: { item: InboxItem; phone: boolean; onOpen: () => void; onRemove: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
      className={cn(
        "hover:bg-muted/60 focus-visible:bg-muted/60 group relative flex cursor-pointer gap-3 px-4 outline-none transition-colors",
        phone ? "py-2.5" : "py-3",
      )}
    >
      {!item.read && <span className="bg-primary absolute left-1.5 top-1/2 size-1.5 -translate-y-1/2 rounded-full" aria-label="New" />}
      <Picture src={item.icon} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className={cn("min-w-0 flex-1 text-sm leading-snug", item.read ? "text-foreground/80" : "text-foreground font-medium")}>
            {plainTitle(item.title)}
          </p>
          <span className={cn("text-muted-foreground shrink-0 pt-0.5 text-[11px] tabular-nums", !phone && "group-hover:hidden group-focus-within:hidden")}>
            {timeAgo(item.at)}
          </span>
          <button
            type="button"
            aria-label="Remove this alert"
            title="Remove"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className={cn(
              "text-muted-foreground hover:text-foreground hover:bg-muted -mr-1 -mt-0.5 size-6 shrink-0 items-center justify-center rounded-full",
              phone ? "inline-flex" : "hidden group-hover:inline-flex group-focus-within:inline-flex",
            )}
          >
            <Icons.Close className="size-3.5" />
          </button>
        </div>
        {item.text ? (
          <p className={cn("text-muted-foreground mt-0.5 whitespace-pre-line text-xs leading-relaxed", phone ? "line-clamp-2" : "line-clamp-4")}>
            {item.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Section({ title }: { title: string }) {
  return (
    <div className="bg-muted/50 text-muted-foreground sticky top-0 z-10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] backdrop-blur">
      {title}
    </div>
  );
}

/** The title without the emoji it starts with: the picture beside it says the same (Discord and the phone
 *  keep it, they have no picture). */
export const plainTitle = (title: string) =>
  title.replace(/^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u{FE0F}\u{200D}\u{20E3}])+\s*/u, "");

const headButton =
  "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50";

function Panel({
  view,
  failed,
  phone,
  onOpen,
  onRemove,
  onClear,
  onSettings,
}: {
  view: InboxView | undefined;
  failed: boolean;
  phone: boolean;
  onOpen: (item: InboxItem) => void;
  onRemove: (item: InboxItem) => void;
  onClear: () => void;
  onSettings: () => void;
}) {
  const items = view?.items ?? [];
  const fresh = items.filter((x) => !x.read);
  const seen = items.filter((x) => x.read);
  const rows = (list: InboxItem[]) =>
    list.map((x) => <Row key={x.id} item={x} phone={phone} onOpen={() => onOpen(x)} onRemove={() => onRemove(x)} />);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
        {phone ? <SheetTitle className="text-lg font-semibold">Alerts</SheetTitle> : <h2 className="text-base font-semibold">Alerts</h2>}
        <div className="flex gap-2">
          <button type="button" className={headButton} disabled={!items.length} onClick={onClear}>
            Clear all
          </button>
          <button type="button" className={headButton} onClick={onSettings}>
            <Icons.Settings className="size-3.5" />
            Settings
          </button>
        </div>
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto", !phone && "max-h-[min(70vh,560px)]")}>
        {items.length ? (
          <>
            {fresh.length ? <><Section title="New" />{rows(fresh)}</> : null}
            {seen.length ? <><Section title={fresh.length ? "Earlier" : "Read"} />{rows(seen)}</> : null}
          </>
        ) : (
          <div className="text-muted-foreground flex flex-col items-center gap-2 px-6 py-10 text-center text-sm">
            <Icons.Bell className="size-6 opacity-50" />
            {failed ? "Couldn't load alerts" : "No alerts yet"}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The bell and its panel. `sidebar`: an icon in the sidebar's top row (the count on the icon), the panel
 * just past the sidebar's edge. `floating`: a round button in the floating bar, the
 * panel above. `mobile`: a button in the phone's bar, the list in a sheet from the bottom.
 */
export function NotificationsBell({ variant, className }: { variant: Variant; className?: string }) {
  const { data, isError } = useInbox();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // Sidebar: the panel opens past the sidebar's right edge, not over the rest of its top row.
  const trigger = useRef<HTMLButtonElement>(null);
  const [edge, setEdge] = useState(10);
  // The newest alert when the panel opened: closing marks up to it read, Clear all clears up to it, so
  // one that comes in while the panel is open stays new.
  const [upTo, setUpTo] = useState<string | null>(null);
  const unread = data?.unread ?? 0;

  const take = (v: InboxView) => qc.setQueryData(INBOX_KEY, v);
  const change = (next: boolean) => {
    if (next) {
      setUpTo(data?.items[0]?.at ?? null);
      const bar = trigger.current?.closest("[data-mside]")?.getBoundingClientRect();
      const own = trigger.current?.getBoundingClientRect();
      if (bar && own) setEdge(Math.max(10, Math.round(bar.right - own.right + 10)));
    }
    else if (unread > 0 && upTo) inboxApi.read({ upTo }).then(take).catch(() => {});
    setOpen(next);
  };
  const panel = (
    <Panel
      view={data}
      failed={isError}
      phone={variant === "mobile"}
      onOpen={(item) => {
        if (!item.read) inboxApi.read({ ids: [item.id] }).then(take).catch(() => {});
        change(false);
        if (item.link) navigate(item.link);
      }}
      onRemove={(item) => inboxApi.remove(item.id).then(take).catch(() => {})}
      onClear={() => inboxApi.clear(upTo ?? undefined).then(take).catch(() => {})}
      onSettings={() => {
        change(false);
        navigate("/settings/alerts");
      }}
    />
  );
  const label = unread ? `Alerts, ${unread} new` : "Alerts";

  if (variant === "mobile") {
    return (
      <>
        <button type="button" aria-label={label} className={className} onClick={() => change(true)}>
          <span className="relative flex size-7 shrink-0 items-center justify-center" aria-hidden="true">
            <Icons.Bell className="size-6" />
            <Count n={unread} className="absolute -right-1.5 -top-1" />
          </span>
        </button>
        <Sheet open={open} onOpenChange={change}>
          <SheetContent
            side="bottom"
            showCloseButton={false}
            className="bg-background inset-x-4 bottom-4 flex max-h-[min(82dvh,720px)] flex-col gap-0 overflow-hidden rounded-[2rem] border-0 px-0 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-0 shadow-2xl"
          >
            <div className="bg-muted mx-auto mt-3 h-1.5 w-14 shrink-0 rounded-full" />
            {panel}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={change}>
      <PopoverTrigger asChild>
        {variant === "floating" ? (
          <button type="button" aria-label={label} className={className}>
            <span className="relative flex size-7 shrink-0 items-center justify-center" aria-hidden="true">
              <Icons.Bell className="size-6" />
              <Count n={unread} className="absolute -right-1.5 -top-1" />
            </span>
          </button>
        ) : (
          <Button
            ref={trigger}
            type="button"
            variant="ghost"
            data-mside-icon=""
            title={label}
            aria-label={label}
            className={cn(className, open && "bg-accent text-foreground")}
          >
            <span className="relative" aria-hidden="true">
              <Icons.Bell />
              <Count n={unread} className="absolute -right-2 -top-1.5" />
            </span>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        side={variant === "floating" ? "top" : "right"}
        align={variant === "floating" ? "center" : "start"}
        sideOffset={variant === "floating" ? 16 : edge}
        collisionPadding={12}
        // No focus ring on Clear all each time it opens; Tab still reaches every button.
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="flex w-[min(400px,calc(100vw-1.5rem))] flex-col overflow-hidden p-0"
      >
        {panel}
      </PopoverContent>
    </Popover>
  );
}
