// money-hub patch: Taxes (owner, 2026-10-02: "plan a new feature, taxes management"). One page per tax
// year in the Spending dashboard's look: how much of the trading profit is taxed, what to set aside for
// April, what is worth a look,
// gifts in and out, what was paid, the dates, and the papers. Everything comes from the money-hub
// service (lib/taxes.ts); the page only shows it and sends the owner's picks back.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import { useDashboardSkins } from "@/features/spending/lib/dashboard-skin";
import { cn } from "@/lib/utils";
import { Page, PageContent, PageHeader, Skeleton } from "@wealthfolio/ui";

import { GiftsCard } from "../components/gifts-card";
import { DatesCard, LooksCard, PaidCard } from "../components/money-cards";
import { PapersCard } from "../components/papers-card";
import { SetAsideCard } from "../components/set-aside-card";
import { AccountsCard, TaxesHero } from "../components/trading-cards";
import { taxesApi, taxesKey, type TaxesView } from "../lib/taxes";

function YearPills({
  years,
  year,
  onPick,
}: {
  years: number[];
  year: number;
  onPick: (y: number) => void;
}) {
  return (
    <div
      className="inline-flex gap-1 rounded-full bg-[var(--m-track)] p-[3px]"
      role="group"
      aria-label="Tax year"
    >
      {years.map((y) => (
        <button
          key={y}
          type="button"
          aria-pressed={y === year}
          onClick={() => onPick(y)}
          className={cn(
            "h-7 rounded-full px-3.5 text-[12.5px] tabular-nums",
            y === year
              ? "bg-[var(--m-surface)] text-[var(--m-ink)]"
              : "text-[var(--m-muted)] hover:text-[var(--m-ink-2)]",
          )}
        >
          {y}
        </button>
      ))}
    </div>
  );
}

/** A slot of the page's grid; one whose card has nothing to show takes no room. */
function Slot({ order, children }: { order: string; children: React.ReactNode }) {
  return <div className={cn("min-w-0 empty:hidden", order)}>{children}</div>;
}

export function TaxesBody({ view }: { view: TaxesView }) {
  return (
    <>
      <div className="grid items-start gap-3.5 max-lg:flex max-lg:flex-col max-lg:items-stretch max-md:gap-2 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="flex min-w-0 flex-col gap-3.5 max-lg:contents">
          <Slot order="max-lg:order-1">
            <TaxesHero view={view} />
          </Slot>
          <Slot order="max-lg:order-4">
            <AccountsCard view={view} />
          </Slot>
          <Slot order="max-lg:order-5">
            <GiftsCard view={view} />
          </Slot>
        </div>
        <div className="flex min-w-0 flex-col gap-3.5 max-lg:contents">
          <Slot order="max-lg:order-2">
            <SetAsideCard view={view} />
          </Slot>
          <Slot order="max-lg:order-3">
            <LooksCard view={view} />
          </Slot>
          <Slot order="max-lg:order-6">
            <PaidCard view={view} />
          </Slot>
          <Slot order="max-lg:order-7">
            <DatesCard view={view} />
          </Slot>
          <Slot order="max-lg:order-8">
            <PapersCard view={view} />
          </Slot>
        </div>
      </div>
      <p className="max-w-[70ch] text-xs text-[var(--m-muted)]">
        An estimate to plan with, from WheelTradr and your bank records. It files nothing and is not
        tax advice: the forms your brokers and your employer send are the final word.
      </p>
    </>
  );
}

export default function TaxesPage() {
  const [params, setParams] = useSearchParams();
  const skins = useDashboardSkins();
  const asked = /^\d{4}$/.test(params.get("year") ?? "") ? Number(params.get("year")) : null;
  const {
    data: view,
    error,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: taxesKey(asked),
    queryFn: () => taxesApi.get(asked),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });
  const pick = (y: number) =>
    setParams(y === Number(view?.today.slice(0, 4)) ? {} : { year: String(y) }, { replace: true });

  return (
    <div className="meadow min-h-screen" data-light-skin={skins.light} data-dark-skin={skins.dark}>
      <Page>
        <PageHeader
          heading="Taxes"
          actions={
            view ? <YearPills years={view.years} year={view.year} onPick={pick} /> : undefined
          }
        />
        <PageContent className="px-3 pb-[var(--mobile-nav-total-offset)] md:px-6 md:pb-8 lg:px-8">
          <div className="flex flex-col gap-3.5 max-md:gap-2">
            {view ? (
              <TaxesBody view={view} />
            ) : isLoading ? (
              <div className="flex flex-col gap-3.5" aria-busy>
                <Skeleton className="h-44 w-full rounded-[20px]" />
                <Skeleton className="h-64 w-full rounded-[20px]" />
              </div>
            ) : (
              <div className="rounded-[20px] border border-[var(--m-line)] bg-[var(--m-surface)] px-[18px] py-4 text-[13.5px]">
                <p>{(error as Error)?.message ?? "The Taxes page could not be loaded."}</p>
                <button
                  type="button"
                  onClick={() => void refetch()}
                  className="mt-1 text-[12.5px] underline underline-offset-4 hover:no-underline"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        </PageContent>
      </Page>
    </div>
  );
}
