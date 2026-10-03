// money-hub patch: the app-wide USD / VND switch (owner, 10-03: "add an app-wide button in the side bar to switch
// values between USD and VND"). Two pills in the sidebar, the shown one in the current-page fill; collapsed, one
// button with the currency's sign over its code that flips to the other. The phone's More sheet has the pills.
// What it does: lib/app-currency.ts.
import { cn } from "@/lib/utils";
import { APP_CURRENCIES, useAppCurrency, type AppCurrency } from "@/lib/app-currency";

const SIGN: Record<AppCurrency, string> = { USD: "$", VND: "₫" };
const TITLE: Record<AppCurrency, string> = {
  USD: "Show amounts in US dollars",
  VND: "Show amounts in Vietnamese dong, at the app's exchange rate",
};

/** The two pills, USD and VND. */
export function CurrencyPills({ className, size = "sidebar" }: { className?: string; size?: "sidebar" | "sheet" }) {
  const [currency, setCurrency] = useAppCurrency();
  return (
    <div
      role="radiogroup"
      aria-label="Show amounts in"
      data-mside-pills=""
      className={cn(
        "bg-muted grid grid-cols-2 gap-0.5 rounded-[10px] p-0.5",
        size === "sheet" ? "h-11 w-40" : "h-9 w-full",
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
              "flex items-center justify-center gap-1.5 rounded-[8px] font-medium tabular-nums transition-colors",
              size === "sheet" ? "text-[15px]" : "text-[13px]",
              on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              // the theme's colours: globals.css, [data-mside-pills]
            )}
          >
            <span aria-hidden="true" className="text-[1.1em] leading-none">
              {SIGN[c]}
            </span>
            {c}
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
  const next: AppCurrency = currency === "USD" ? "VND" : "USD";
  return (
    <button
      type="button"
      onClick={() => setCurrency(next)}
      data-mside-row=""
      title={TITLE[next]}
      aria-label={`Amounts in ${currency}. ${TITLE[next]}`}
      className={cn(
        "hover:bg-accent hover:text-accent-foreground inline-flex items-center rounded-md",
        rowClassName,
      )}
    >
      <span aria-hidden="true" className="flex size-5 items-center justify-center text-[19px] font-medium leading-none">
        {SIGN[currency]}
      </span>
      <span className="w-full truncate text-center text-[10px] font-medium leading-[11px]">{currency}</span>
    </button>
  );
}
