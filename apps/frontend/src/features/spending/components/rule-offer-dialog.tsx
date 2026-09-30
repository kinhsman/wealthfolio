// money-hub patch: the Make a rule preview (lib/rule-offer.ts). Shows the rule that would be made,
// words and category both editable, and the transactions it would re-file, live from the money-hub
// service; nothing is saved until Make the rule. Mounted once in App.tsx.
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icons,
  Input,
  Label,
  PrivacyAmount,
} from "@wealthfolio/ui";

import { useAccounts } from "@/hooks/use-accounts";
import { useTaxonomy } from "@/hooks/use-taxonomies";
import { QueryKeys } from "@/lib/query-keys";

import { createCategorizationRule } from "../adapters/rules";
import { invalidateSpendingCaches } from "../lib/invalidation";
import { ruleOfferStore, type RuleOffer } from "../lib/rule-offer";
import { QuickCategorizePopover } from "./quick-categorize-popover";

interface PreviewItem {
  id: string;
  date: string;
  notes: string;
  amount: number;
  accountId: string;
  from: string | null;
  to: string;
}

async function hub<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/money-hub/plaid${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `The money app helper said ${res.status}`);
  return data as T;
}

const day = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00`);
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(thisYear ? {} : { year: "numeric" }) });
};

export function RuleOfferHost() {
  const offer = useSyncExternalStore(ruleOfferStore.subscribe, ruleOfferStore.get);
  if (!offer) return null;
  return <RuleOfferDialog key={`${offer.pattern}:${offer.categoryId}`} offer={offer} onClose={ruleOfferStore.close} />;
}

function RuleOfferDialog({ offer, onClose }: { offer: RuleOffer; onClose: () => void }) {
  const qc = useQueryClient();
  const [pattern, setPattern] = useState(offer.pattern);
  const [target, setTarget] = useState({ taxonomyId: offer.taxonomyId, categoryId: offer.categoryId });
  const [busy, setBusy] = useState(false);
  // The matches list opens from the footer's Preview N matches (owner's reference, 09-30).
  const [showMatches, setShowMatches] = useState(false);

  // The preview follows what is typed, a moment after typing stops.
  const [debounced, setDebounced] = useState(offer.pattern);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(pattern.trim()), 400);
    return () => clearTimeout(t);
  }, [pattern]);

  const spending = useTaxonomy("spending_categories");
  const income = useTaxonomy("income_sources");
  const savings = useTaxonomy("savings_categories");
  const categories = useMemo(() => {
    const map = new Map<string, { name: string; color: string | null }>();
    for (const c of [...(spending.data?.categories ?? []), ...(income.data?.categories ?? []), ...(savings.data?.categories ?? [])]) {
      map.set(c.id, { name: c.name, color: c.color ?? null });
    }
    return map;
  }, [spending.data?.categories, income.data?.categories, savings.data?.categories]);
  const { accounts } = useAccounts({ filterActive: false });
  const accountName = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a.name])), [accounts]);

  const preview = useQuery({
    queryKey: ["money-hub", "rule-preview", debounced, target.taxonomyId, target.categoryId],
    queryFn: () =>
      hub<{ count: number; items: PreviewItem[] }>("/preview-rule", {
        pattern: debounced,
        matchType: "contains",
        taxonomyId: target.taxonomyId,
        categoryId: target.categoryId,
      }),
    enabled: debounced.length >= 2,
  });

  const category = categories.get(target.categoryId);
  const categoryName = category?.name ?? "that category";
  const ready = pattern.trim().length >= 2 && !!target.categoryId;

  const make = async () => {
    setBusy(true);
    try {
      const words = pattern.trim();
      const rule = await createCategorizationRule({
        name: words,
        pattern: words,
        matchType: "contains",
        taxonomyId: target.taxonomyId,
        categoryId: target.categoryId,
        priority: 0,
        isGlobal: true,
      });
      qc.invalidateQueries({ queryKey: [QueryKeys.SPENDING_RULES] });
      const done = await hub<{ changed: number }>("/apply-rule", { ruleId: rule.id }).catch(() => null);
      invalidateSpendingCaches(qc);
      toast.success(
        done == null
          ? "Rule made. Transactions like it are filed within a minute."
          : done.changed > 0
            ? `Rule made. ${done.changed} re-filed as ${categoryName}.`
            : "Rule made. Nothing else matched it yet.",
      );
      onClose();
    } catch (e) {
      toast.error(`The rule was not made: ${(e as Error)?.message ?? String(e)}`);
      setBusy(false);
    }
  };

  const count = preview.data?.count ?? 0;
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Make a rule</DialogTitle>
          <DialogDescription>
            Transactions whose text contains these words get this category, the ones below now and new ones as they come in.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="rule-offer-words">Words to look for</Label>
            <Input id="rule-offer-words" value={pattern} onChange={(e) => setPattern(e.target.value)} autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label>File as</Label>
            <QuickCategorizePopover
              selectedCategoryId={target.categoryId}
              onSelect={(taxonomyId, categoryId) => setTarget({ taxonomyId, categoryId })}
              trigger={
                <Button type="button" variant="outline" className="w-full justify-start gap-2 font-normal">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: category?.color ?? "var(--muted-foreground)" }} />
                  <span className="truncate">{categoryName}</span>
                  <Icons.ChevronDown className="ml-auto h-4 w-4 opacity-50" />
                </Button>
              }
            />
          </div>
        </div>

        <div className="rounded-lg border">
          <div className="text-muted-foreground flex items-center gap-2 border-b px-3 py-2 text-xs">
            {preview.isFetching ? <Icons.Spinner className="h-3.5 w-3.5 animate-spin" /> : null}
            {!ready
              ? "Type the words to look for."
              : preview.isError
                ? `The preview could not load: ${(preview.error as Error).message}`
                : preview.isFetching && !preview.data
                  ? "Looking for transactions like it"
                  : count === 0
                    ? "Nothing else matches yet. New transactions like it will get this category."
                    : `${count} transaction${count === 1 ? "" : "s"} will be re-filed as ${categoryName}${count > (preview.data?.items.length ?? 0) ? `, the latest ${preview.data?.items.length} shown` : ""}.`}
          </div>
          {count > 0 && ready && showMatches ? (
            <div className="max-h-64 divide-y overflow-y-auto">
              {preview.data!.items.map((it) => (
                <div key={it.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{it.notes}</div>
                    <div className="text-muted-foreground truncate text-xs">
                      {[day(it.date), accountName.get(it.accountId), `${it.from ? categories.get(it.from)?.name ?? "No category" : "No category"} to ${categoryName}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums">
                    <PrivacyAmount value={Math.abs(it.amount)} currency="USD" />
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowMatches((v) => !v)}
              disabled={!ready || count === 0 || busy}
            >
              {preview.isFetching && ready ? <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
              {showMatches && count > 0 ? "Hide matches" : `Preview ${count} ${count === 1 ? "match" : "matches"}`}
            </Button>
            <Button type="button" onClick={make} disabled={!ready || busy}>
              {busy ? <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
              Make the rule
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
