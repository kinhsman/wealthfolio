// money-hub patch: the "Counts as" picker for a bank entry, the rule it then offers, and the list
// of those rules on Settings, Spending, Rules (see ../lib/counts-as.ts).
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

import { invalidateSpendingCaches } from "../lib/invalidation";
import {
  COUNTS_AS_LABEL,
  COUNTS_AS_RULES_KEY,
  countsAsRuleStore,
  countsAsStore,
  hubCountsAs,
  setCountsAs,
  type CountsAs,
  type CountsAsChoice,
  type CountsAsPreviewItem,
  type CountsAsRule,
  type CountsAsRuleOffer,
  type CountsAsTarget,
} from "../lib/counts-as";
import { rulePatternFrom } from "../lib/rule-offer";
import { KeywordChips, withTyped } from "./keyword-chips";

const CHOICES: { value: CountsAsChoice; label: string; out: string; in: string }[] = [
  { value: "spending", label: "Spending", out: "Money I spent. Shows in Spending.", in: "Money back, like a refund. Lowers Spending." },
  { value: "income", label: "Income", out: "", in: "Money I earned or was given. Shows in Income." },
  { value: "saving", label: "Saving", out: "Money moved to my own account or savings. Shows in Set aside.", in: "My own money coming back. Not income." },
  { value: "neutral", label: "Not counted", out: "Leave it out of every total, like something counted elsewhere.", in: "Leave it out of every total, like something counted elsewhere." },
];

const caps = "text-muted-foreground text-xs font-semibold uppercase tracking-[0.08em]";

const day = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00`);
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(thisYear ? {} : { year: "numeric" }) });
};

/** After a pick: offer the same for every entry with these words, unless such a rule exists. */
async function offerCountsAsRule(notes: string | null | undefined, choice: CountsAsChoice) {
  const pattern = rulePatternFrom(notes);
  if (!pattern) return;
  const rules = await hubCountsAs<CountsAsRule[]>("/rules").catch(() => []);
  const p = pattern.toLowerCase();
  if (rules.some((r) => r.choice === choice && r.words.some((w) => w.toLowerCase() === p))) return;
  toast(`Always count "${pattern}" as ${COUNTS_AS_LABEL[choice]}?`, {
    duration: 15000,
    action: { label: "Make a rule", onClick: () => countsAsRuleStore.open({ pattern, choice }) },
    actionButtonStyle: { height: 32, padding: "0 14px", fontSize: 13, fontWeight: 600, borderRadius: 6 },
  });
}

export function CountsAsHost() {
  const target = useSyncExternalStore(countsAsStore.subscribe, countsAsStore.get);
  const offer = useSyncExternalStore(countsAsRuleStore.subscribe, countsAsRuleStore.get);
  return (
    <>
      {target ? <CountsAsDialog key={target.activity.id} target={target} onClose={countsAsStore.close} /> : null}
      {offer ? <CountsAsRuleDialog key={`${offer.pattern}:${offer.choice}`} offer={offer} onClose={countsAsRuleStore.close} /> : null}
    </>
  );
}

function CountsAsDialog({ target, onClose }: { target: CountsAsTarget; onClose: () => void }) {
  const qc = useQueryClient();
  const a = target.activity;
  const out = a.netAmount < 0;
  const now = a.cashFlowBucket;
  const [busy, setBusy] = useState<CountsAs | null>(null);

  const pick = async (choice: CountsAs) => {
    setBusy(choice);
    try {
      const r = await setCountsAs(a.id, choice);
      invalidateSpendingCaches(qc);
      if (choice === "auto" || r.pending) {
        toast.success("Back to the bank's choice. It is filed again within a few minutes.");
      } else {
        toast.success(`Now counts as ${COUNTS_AS_LABEL[choice]}.`);
        void offerCountsAsRule(a.notes, choice);
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Counts as</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <span className="min-w-0 truncate">{a.notes}</span>
            <span className="shrink-0 tabular-nums">
              {out ? "-" : "+"}
              <PrivacyAmount value={Math.abs(a.netAmount)} currency={a.currency} />
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {CHOICES.filter((c) => !(c.value === "income" && out)).map((c) => {
            const on = now === c.value;
            return (
              <button
                key={c.value}
                type="button"
                disabled={busy !== null}
                onClick={() => (on ? onClose() : pick(c.value))}
                className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
                  on ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                }`}
              >
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                  {busy === c.value ? (
                    <Icons.Spinner className="h-4 w-4 animate-spin" />
                  ) : on ? (
                    <Icons.Check className="text-primary h-4 w-4" />
                  ) : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{c.label}</span>
                  <span className="text-muted-foreground block text-xs">{out ? c.out : c.in}</span>
                </span>
              </button>
            );
          })}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => pick("auto")}>
            {busy === "auto" ? <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
            Bank's choice
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Make a rule: words, what they count as, and the matches to move now (all ticked). */
function CountsAsRuleDialog({ offer, onClose }: { offer: CountsAsRuleOffer; onClose: () => void }) {
  const qc = useQueryClient();
  const [words, setWords] = useState<string[]>([offer.pattern]);
  const [typing, setTyping] = useState("");
  const [choice, setChoice] = useState<CountsAsChoice>(offer.choice);
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const all = withTyped(words, typing);
  const key = all.join("\u0001");

  const [debounced, setDebounced] = useState(key);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(key), 400);
    return () => clearTimeout(t);
  }, [key]);

  const { accounts } = useAccounts({ filterActive: false });
  const accountName = useMemo(() => new Map((accounts ?? []).map((x) => [x.id, x.name])), [accounts]);

  const preview = useQuery({
    queryKey: ["money-hub", "counts-as-preview", debounced, choice],
    queryFn: () =>
      hubCountsAs<{ count: number; items: CountsAsPreviewItem[] }>("/preview", "POST", {
        words: debounced.split("\u0001").filter(Boolean),
        choice,
      }),
    enabled: debounced.length >= 2,
  });
  useEffect(() => setUnticked(new Set()), [debounced, choice]);

  const items = preview.data?.items ?? [];
  const count = preview.data?.count ?? 0;
  const ticked = items.filter((it) => !unticked.has(it.id));
  const settled = all.length > 0 && !preview.isFetching && debounced === key;

  const make = async () => {
    setBusy(true);
    try {
      const done = await hubCountsAs<{ changed: number }>("/rules", "POST", {
        words: all,
        choice,
        ids: ticked.map((it) => it.id),
        skip: items.filter((it) => unticked.has(it.id)).map((it) => it.id),
      });
      qc.invalidateQueries({ queryKey: COUNTS_AS_RULES_KEY });
      invalidateSpendingCaches(qc);
      toast.success(
        done.changed > 0
          ? `Rule created. ${done.changed} now count${done.changed === 1 ? "s" : ""} as ${COUNTS_AS_LABEL[choice]}.`
          : "Rule created. New transactions like it will follow it.",
      );
      onClose();
    } catch (e) {
      toast.error(`The rule was not created: ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Make a rule</DialogTitle>
          <DialogDescription>Bank transactions whose text contains any of these words count as this.</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="counts-as-words">Words to look for</Label>
          <KeywordChips id="counts-as-words" words={words} onChange={setWords} typing={typing} onTyping={setTyping} />
        </div>
        <div className="space-y-1.5">
          <Label>Counts as</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CHOICES.map((c) => (
              <Button
                key={c.value}
                type="button"
                variant={choice === c.value ? "default" : "outline"}
                size="sm"
                disabled={busy}
                onClick={() => setChoice(c.value)}
              >
                {c.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border">
          <div className="flex items-center justify-between gap-3 border-b px-3 py-2.5">
            <span className={`${caps} flex items-center gap-2`}>
              {preview.isFetching ? <Icons.Spinner className="h-3.5 w-3.5 animate-spin" /> : null}
              {!all.length
                ? "Type the words to look for"
                : preview.isError
                  ? "The matches could not load"
                  : !settled
                    ? "Looking for transactions like it"
                    : `${count} ${count === 1 ? "transaction" : "transactions"} would change`}
            </span>
            {settled && items.length > 0 ? (
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
          {preview.isError ? (
            <p className="text-muted-foreground px-3 py-2.5 text-xs">{(preview.error as Error).message}</p>
          ) : settled && items.length === 0 ? (
            <p className="text-muted-foreground px-3 py-2.5 text-xs">None to change now. New transactions like it will follow the rule.</p>
          ) : settled ? (
            <div className="max-h-[40dvh] divide-y overflow-y-auto">
              {items.map((it) => (
                <label key={it.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{it.notes}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {[day(it.date), accountName.get(it.accountId), `now ${COUNTS_AS_LABEL[it.now as CountsAsChoice] ?? it.now}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums">
                    <PrivacyAmount value={Math.abs(it.amount)} currency="USD" />
                  </span>
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
                    aria-label={`Change ${it.notes}, ${day(it.date)}`}
                  />
                </label>
              ))}
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={make} disabled={busy || !settled || preview.isError}>
            {busy ? <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Settings, Spending, Rules: the Counts as rules, each with a delete. Hidden while there are none. */
export function CountsAsRulesSection() {
  const qc = useQueryClient();
  const rules = useQuery({ queryKey: COUNTS_AS_RULES_KEY, queryFn: () => hubCountsAs<CountsAsRule[]>("/rules") });
  const [removing, setRemoving] = useState<string | null>(null);
  const list = rules.data ?? [];
  if (!list.length) return null;

  const remove = async (id: string) => {
    setRemoving(id);
    try {
      await hubCountsAs(`/rules/${encodeURIComponent(id)}`, "DELETE");
      await qc.invalidateQueries({ queryKey: COUNTS_AS_RULES_KEY });
      toast.success("Rule deleted. Transactions it moved stay as they are.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRemoving(null);
    }
  };

  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-medium">Counts as rules</h3>
        <p className="text-muted-foreground text-xs">
          Bank transactions with these words count as Spending, Income, Saving or Not counted. Made from a transaction's Counts as.
        </p>
      </div>
      <div className="divide-border divide-y rounded-md border">
        {list.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="min-w-0 flex-1 text-sm">
              <span className="text-muted-foreground">If the text contains </span>
              {r.words.map((w) => `‘${w}’`).join(" or ")}
            </span>
            <span className="bg-muted shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium">{COUNTS_AS_LABEL[r.choice]}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              disabled={removing !== null}
              onClick={() => remove(r.id)}
              aria-label={`Delete the rule for ${r.words.join(", ")}`}
            >
              {removing === r.id ? <Icons.Spinner className="h-4 w-4 animate-spin" /> : <Icons.Trash className="h-4 w-4" />}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
