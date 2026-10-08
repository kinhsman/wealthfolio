// money-hub patch: Maintenance, the numbers on top: what is overdue, what is coming up (30 days or 600 miles), what
// was spent this year, and what is next. On a phone one strip of three, keywords only.
import { cn } from "@/lib/utils";
import { PrivacyAmount } from "@wealthfolio/ui";

import { tabName, type UpkeepView } from "../lib/upkeep";
import { Card } from "./parts";

const NAMES_SHOWN = 3;

function Tile({
  label,
  value,
  sub,
  tone,
  small,
}: {
  label: string;
  value: React.ReactNode;
  sub: React.ReactNode;
  tone?: "bad" | "warn";
  small?: boolean;
}) {
  return (
    <Card className="min-w-0 !px-3.5 !py-3">
      <div className="text-[12px] text-[var(--m-muted)]">{label}</div>
      <div
        className={cn(
          "mt-0.5 truncate font-medium tabular-nums tracking-[-0.01em]",
          small ? "text-[18px] leading-[30px]" : "text-[24px]",
          tone === "bad" && "text-[var(--m-bad)]",
          tone === "warn" && "text-[var(--m-warn)]",
        )}
      >
        {value}
      </div>
      <div className="truncate text-[12px] text-[var(--m-muted)]">{sub}</div>
    </Card>
  );
}

export function Summary({ view, phone }: { view: UpkeepView; phone: boolean }) {
  const { summary, spent, currency, plans } = view;
  const late = plans.flatMap((p) => p.jobs.filter((j) => j.status.kind === "bad"));
  const names = late.slice(0, NAMES_SHOWN).map((j) => j.name);
  const lateText = late.length
    ? `${names.join(", ")}${late.length > NAMES_SHOWN ? ` +${late.length - NAMES_SHOWN}` : ""}`
    : "Nothing late";
  const money = <PrivacyAmount value={Math.round(spent.total)} currency={currency} />;
  if (phone)
    return (
      <Card bleed className="grid grid-cols-3 px-1 py-[7px] text-center">
        <div>
          <div
            className={cn(
              "text-[19px] font-medium tabular-nums leading-[1.15]",
              summary.overdue > 0 && "text-[var(--m-bad)]",
            )}
          >
            {summary.overdue}
          </div>
          <div className="text-[11px] text-[var(--m-muted)]">Overdue</div>
        </div>
        <div>
          <div
            className={cn(
              "text-[19px] font-medium tabular-nums leading-[1.15]",
              summary.soon > 0 && "text-[var(--m-warn)]",
            )}
          >
            {summary.soon}
          </div>
          <div className="text-[11px] text-[var(--m-muted)]">Soon</div>
        </div>
        <div>
          <div className="text-[19px] font-medium tabular-nums leading-[1.15]">{money}</div>
          <div className="text-[11px] text-[var(--m-muted)]">This year</div>
        </div>
      </Card>
    );
  const paid = plans.filter((p) => spent.byAsset[p.assetId]);
  const split = paid.length
    ? paid.map((p, i) => (
        <span key={p.assetId}>
          {i ? " · " : ""}
          {tabName(p)}{" "}
          <PrivacyAmount
            value={Math.round(spent.byAsset[p.assetId])}
            currency={currency}
            className="inline"
          />
        </span>
      ))
    : "Nothing yet";
  const next = summary.next;
  return (
    <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
      <Tile
        label="Overdue"
        value={summary.overdue}
        sub={lateText}
        tone={summary.overdue > 0 ? "bad" : undefined}
      />
      <Tile
        label="Coming up"
        value={summary.soon}
        sub="Next 30 days or 600 mi"
        tone={summary.soon > 0 ? "warn" : undefined}
      />
      <Tile label={`Spent in ${spent.year}`} value={money} sub={split} />
      <Tile
        label="Next up"
        value={next ? next.name : "None"}
        sub={next ? `${next.assetName} · ${next.chip}` : "Add a job to see it"}
        small
      />
    </div>
  );
}
