// money-hub patch: the app-wide USD / VND / Original switch (owner, 10-03: "add an app-wide button in the side bar
// to switch values between USD and VND", then "a third option to show their original currency value"). Three pills
// in the sidebar, the shown one raised; collapsed, one button with the currency's sign over its name that steps to
// the next. The phone's More sheet has the pills. What it does: lib/app-currency.ts.
import { cn } from "@/lib/utils";
import { APP_CURRENCIES, useAppCurrency, type AppCurrency } from "@/lib/app-currency";

// ¤ is the generic currency sign: Original has no currency of its own.
const SIGN: Record<AppCurrency, string> = { USD: "$", VND: "₫", ORIGINAL: "¤" };
const NAME: Record<AppCurrency, string> = { USD: "USD", VND: "VND", ORIGINAL: "Original" };
const TITLE: Record<AppCurrency, string> = {
  USD: "Show amounts in US dollars, at the app's exchange rate",
  VND: "Show amounts in Vietnamese dong, at the app's exchange rate",
  ORIGINAL: "Show each amount in the currency it is kept in, no exchange rate",
};

/** The three pills: USD, VND, Original. */
export function CurrencyPills({ className, size = "sidebar" }: { className?: string; size?: "sidebar" | "sheet" }) {
  const [currency, setCurrency] = useAppCurrency();
  return (
    <div
      role="radiogroup"
      aria-label="Show amounts in"
      data-mside-pills=""
      className={cn(
        "bg-muted grid grid-cols-3 gap-0.5 rounded-[10px] p-0.5",
        size === "sheet" ? "h-11 w-full" : "h-9 w-full",
        className,
      )}
    >
      {APP_CURRENCIES.map((c) => {
        const on = c === currency;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={on}
            data-on={on ? "" : undefined}
            onClick={() => setCurrency(c)}
            title={TITLE[c]}
            className={cn(
              "flex min-w-0 items-center justify-center gap-1 rounded-[8px] font-medium tabular-nums transition-colors",
              size === "sheet" ? "text-[15px]" : "text-[12.5px]",
              on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              // the theme's colours: globals.css, [data-mside-pills]
            )}
          >
            {c !== "ORIGINAL" && (
              <span aria-hidden="true" className="text-[1.1em] leading-none">
                {SIGN[c]}
              </span>
            )}
            <span className="truncate">{NAME[c]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The sidebar's switch: the pills when open, one flip button on the narrow rail. */
export function SidebarCurrencySwitch({ collapsed, rowClassName }: { collapsed: boolean; rowClassName: string }) {
  const [currency, setCurrency] = useAppCurrency();
  if (!collapsed) return <CurrencyPills className="mb-1.5" />;
  const next = APP_CURRENCIES[(APP_CURRENCIES.indexOf(currency) + 1) % APP_CURRENCIES.length];
  return (
    <button
      type="button"
      onClick={() => setCurrency(next)}
      data-mside-row=""
      title={TITLE[next]}
      aria-label={`Amounts in ${NAME[currency]}. ${TITLE[next]}`}
      className={cn(
        "hover:bg-accent hover:text-accent-foreground inline-flex items-center rounded-md",
        rowClassName,
      )}
    >
      <span aria-hidden="true" className="flex size-5 items-center justify-center text-[19px] font-medium leading-none">
        {SIGN[currency]}
      </span>
      <span className="w-full truncate text-center text-[10px] font-medium leading-[11px]">{NAME[currency]}</span>
    </button>
  );
}
