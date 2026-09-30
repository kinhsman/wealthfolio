// money-hub patch: the Make a rule window (lib/rule-offer.ts), two steps after the owner's reference
// (2026-09-30): 1. the rule, words and category editable, with Preview N matches; 2. Preview the
// updates: the rule in words, every transaction it would re-file with a tick each (Select all), and
// Create rule. Unticked ones keep their category and later rule runs leave them alone. The matches
// come live from the money-hub service; nothing is saved before Create rule. Mounted once in App.tsx.
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icons,
  Label,
  PrivacyAmount,
} from "@wealthfolio/ui";

import { useAccounts } from "@/hooks/use-accounts";
import { useTaxonomy } from "@/hooks/use-taxonomies";
import { QueryKeys } from "@/lib/query-keys";

import { createCategorizationRule } from "../adapters/rules";
import { invalidateSpendingCaches } from "../lib/invalidation";
import { ruleOfferStore, type RuleOffer } from "../lib/rule-offer";
import { CategoryIcon } from "./category-chips";
import { QuickCategorizePopover } from "./quick-categorize-popover";
import { keywordsToRule } from "../lib/keywords";
import { KeywordChips, withTyped } from "./keyword-chips";

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

const caps = "text-muted-foreground text-xs font-semibold uppercase tracking-[0.08em]";

export function RuleOfferHost() {
  const offer = useSyncExternalStore(ruleOfferStore.subscribe, ruleOfferStore.get);
  if (!offer) return null;
  return <RuleOfferDialog key={`${offer.pattern}:${offer.categoryId}`} offer={offer} onClose={ruleOfferStore.close} />;
}

function RuleOfferDialog({ offer, onClose }: { offer: RuleOffer; onClose: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<"rule" | "review">("rule");
  const [words, setWords] = useState<string[]>([offer.pattern]);
  const [typing, setTyping] = useState("");
  const all = withTyped(words, typing);
  const key = all.join("\u0001");
  const [target, setTarget] = useState({ taxonomyId: offer.taxonomyId, categoryId: offer.categoryId });
  const [busy, setBusy] = useState(false);
  const [showMatches, setShowMatches] = useState(false);
  const [unticked, setUnticked] = useState<Set<string>>(new Set());

  // The matches follow what is typed, a moment after typing stops.
  const [debounced, setDebounced] = useState(key);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(key), 400);
    return () => clearTimeout(t);
  }, [key]);

  const spending = useTaxonomy("spending_categories");
  const income = useTaxonomy("income_sources");
  const savings = useTaxonomy("savings_categories");
  const categories = useMemo(() => {
    const map = new Map<string, { name: string; color: string | null; icon: string | null }>();
    for (const c of [...(spending.data?.categories ?? []), ...(income.data?.categories ?? []), ...(savings.data?.categories ?? [])]) {
      map.set(c.id, { name: c.name, color: c.color ?? null, icon: c.icon ?? null });
    }
    return map;
  }, [spending.data?.categories, income.data?.categories, savings.data?.categories]);
  const { accounts } = useAccounts({ filterActive: false });
  const accountName = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a.name])), [accounts]);

  const preview = useQuery({
    queryKey: ["money-hub", "rule-preview", debounced, target.taxonomyId, target.categoryId],
    queryFn: () =>
      hub<{ count: number; items: PreviewItem[] }>("/preview-rule", {
        ...keywordsToRule(debounced.split("\u0001").filter(Boolean)),
        taxonomyId: target.taxonomyId,
        categoryId: target.categoryId,
      }),
    enabled: debounced.length >= 2,
  });
  // A different rule means a different list: start again with every match ticked.
  useEffect(() => setUnticked(new Set()), [debounced, target.categoryId]);

  const category = categories.get(target.categoryId);
  const categoryName = category?.name ?? "that category";
  const ready = all.length > 0 && !!target.categoryId;
  const items = preview.data?.items ?? [];
  const count = preview.data?.count ?? 0;
  const ticked = items.filter((it) => !unticked.has(it.id));
  const settled = ready && !preview.isFetching && debounced === key;

  const make = async () => {
    setBusy(true);
    try {
      const rule = await createCategorizationRule({
        name: all.join(", ").slice(0, 60),
        ...keywordsToRule(all),
        taxonomyId: target.taxonomyId,
        categoryId: target.categoryId,
        priority: 0,
        isGlobal: true,
      });
      qc.invalidateQueries({ queryKey: [QueryKeys.SPENDING_RULES] });
      const done = await hub<{ changed: number }>("/apply-rule", { ruleId: rule.id, ids: ticked.map((it) => it.id) }).catch(() => null);
      invalidateSpendingCaches(qc);
      toast.success(
        done == null
          ? "Rule created. Transactions like it are filed within a minute."
          : done.changed > 0
            ? `Rule created. ${done.changed} filed as ${categoryName}.`
            : "Rule created. New transactions like it will be filed.",
      );
      onClose();
    } catch (e) {
      toast.error(`The rule was not created: ${(e as Error)?.message ?? String(e)}`);
      setBusy(false);
    }
  };

  const catBadge = (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: category?.color ? `${category.color}26` : "var(--muted)", color: category?.color ?? undefined }}
    >
      <CategoryIcon icon={category?.icon ?? null} fallback={categoryName} className="h-5 w-5" />
    </span>
  );

  const matchesList = (withTicks: boolean) => (
    <div className="max-h-[45dvh] divide-y overflow-y-auto">
      {items.map((it) => {
        const from = it.from ? categories.get(it.from) : undefined;
        return (
          <label key={it.id} className={`flex items-center gap-3 px-3 py-2.5 ${withTicks ? "cursor-pointer" : ""}`}>
            <span className="shrink-0" style={{ color: from?.color ?? undefined }}>
              <CategoryIcon icon={from?.icon ?? null} fallback={from?.name} className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{it.notes}</span>
              <span className="text-muted-foreground block truncate text-xs">
                {[day(it.date), accountName.get(it.accountId), from ? `now ${from.name}` : "no category now"].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="shrink-0 text-sm tabular-nums">
              <PrivacyAmount value={Math.abs(it.amount)} currency="USD" />
            </span>
            {withTicks ? (
              <Checkbox
                checked={!unticked.has(it.id)}
                onCheckedChange={(v) =>
                  setUnticked((prev) => {
                    const next = new Set(prev);
                    if (v === true) next.delete(it.id);
                    else next.add(it.id);
                    return next;
                  })
                }
                aria-label={`Re-file ${it.notes}, ${day(it.date)}`}
              />
            ) : null}
          </label>
        );
      })}
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[560px]">
        {step === "rule" ? (
          <>
            <DialogHeader>
              <DialogTitle>Make a rule</DialogTitle>
              <DialogDescription>Transactions whose text contains any of these words get this category.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="rule-offer-words">Words to look for</Label>
                <KeywordChips id="rule-offer-words" words={words} onChange={setWords} typing={typing} onTyping={setTyping} />
              </div>
              <div className="space-y-1.5">
                <Label>File as</Label>
                <QuickCategorizePopover
                  selectedCategoryId={target.categoryId}
                  onSelect={(taxonomyId, categoryId) => setTarget({ taxonomyId, categoryId })}
                  trigger={
                    <Button type="button" variant="outline" className="w-full justify-start gap-2 font-normal">
                      <span style={{ color: category?.color ?? undefined }}>
                        <CategoryIcon icon={category?.icon ?? null} fallback={categoryName} className="h-4 w-4" />
                      </span>
                      <span className="truncate">{categoryName}</span>
                      <Icons.ChevronDown className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  }
                />
              </div>
            </div>

            <p className="text-muted-foreground flex items-center gap-2 text-xs">
              {preview.isFetching && ready ? <Icons.Spinner className="h-3.5 w-3.5 animate-spin" /> : null}
              {!ready
                ? "Type the words to look for."
                : preview.isError
                  ? `The matches could not load: ${(preview.error as Error).message}`
                  : !settled
                    ? "Looking for transactions like it"
                    : count === 0
                      ? "No other transaction matches yet. New ones like it will get this category."
                      : `${count} transaction${count === 1 ? "" : "s"} would be re-filed as ${categoryName}.`}
            </p>
            {showMatches && settled && count > 0 ? <div className="rounded-lg border">{matchesList(false)}</div> : null}

            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button type="button" variant="outline" onClick={() => setShowMatches((v) => !v)} disabled={!settled || count === 0}>
                  {showMatches && count > 0 ? "Hide matches" : `Preview ${settled ? count : "…"} ${count === 1 ? "match" : "matches"}`}
                </Button>
                <Button type="button" onClick={() => setStep("review")} disabled={!settled || preview.isError}>
                  Review rule
                </Button>
              </div>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="icon" className="-ml-2 h-8 w-8" onClick={() => setStep("rule")} disabled={busy} aria-label="Back to the rule">
                  <Icons.ChevronLeft className="h-4 w-4" />
                </Button>
                <DialogTitle className={caps}>Preview the updates</DialogTitle>
              </div>
              <DialogDescription className="sr-only">The rule and the transactions it will re-file.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 rounded-xl border p-4">
              <div className="bg-muted rounded-lg px-4 py-3 text-sm">
                If the text contains {all.map((w) => `\u2018${w}\u2019`).join(" or ")}
              </div>
              <div className="flex items-center justify-between gap-3 border-b pb-4">
                <div className="min-w-0">
                  <div className="text-muted-foreground text-sm">Category</div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="text-muted-foreground" aria-hidden="true">↳</span>
                    <span className="truncate">{categoryName}</span>
                  </div>
                </div>
                {catBadge}
              </div>
              <p className="text-sm">The following transactions and future matches will be filed under this category:</p>
              <div className="rounded-lg border">
                <div className="flex items-center justify-between gap-3 border-b px-3 py-2.5">
                  <span className={caps}>
                    {count} {count === 1 ? "transaction" : "transactions"} matched
                  </span>
                  {items.length > 0 ? (
                    <label className={`${caps} flex cursor-pointer items-center gap-3`}>
                      Select all
                      <Checkbox
                        checked={unticked.size === 0}
                        onCheckedChange={(v) => setUnticked(v === true ? new Set() : new Set(items.map((it) => it.id)))}
                        aria-label="Select all"
                      />
                    </label>
                  ) : null}
                </div>
                {items.length > 0 ? (
                  matchesList(true)
                ) : (
                  <p className="text-muted-foreground px-3 py-4 text-sm">None yet. New transactions like it will be filed as they come in.</p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" onClick={make} disabled={busy}>
                {busy ? <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create rule
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
