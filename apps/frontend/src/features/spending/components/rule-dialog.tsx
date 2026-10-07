// money-hub patch: the ONE rule window (owner, 2026-10-07: "make them use 1 single window, most robust
// win. So they are not split brain"). It was two: Make a rule (after filing a transaction: words and a
// category, a live preview) and Settings, Rules (every condition, no preview). Now both open this one
// through ruleOfferStore (lib/rule-offer.ts), adding or editing:
//   1. the rule: the full form (components/rule-form.tsx) with the matches following what is typed;
//   2. Preview the updates: the rule in words, every transaction it would re-file with a tick each
//      (Select all) and Create rule / Save rule. Unticked ones keep their category and later rule
//      runs leave them alone. Nothing is saved before that button.
// The matches come live from the money-hub service (/api/money-hub/plaid/preview-rule). Mounted once in App.tsx.
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Icons,
  PrivacyAmount,
} from "@wealthfolio/ui";

import { useAccounts } from "@/hooks/use-accounts";
import { useTaxonomy } from "@/hooks/use-taxonomies";
import { QueryKeys } from "@/lib/query-keys";

import { createCategorizationRule, updateCategorizationRule } from "../adapters/rules";
import { useCategorizationRules } from "../hooks/use-categorization-rules";
import { useRuleFormOptions } from "../hooks/use-rule-form-options";
import { invalidateSpendingCaches } from "../lib/invalidation";
import { ruleToKeywords } from "../lib/keywords";
import { ruleOfferStore, type RuleOffer } from "../lib/rule-offer";
import { saveRuleRename } from "../lib/rule-renames";
import { saveRuleTransfers, useRuleTransfers } from "../lib/rule-transfers";
import { CategoryIcon } from "./category-chips";
import { RuleForm, ruleAmountPayload, type RuleDraft, type RuleFormValues } from "./rule-form";

interface PreviewItem {
  id: string;
  date: string;
  notes: string;
  amount: number;
  accountId: string;
  from: string | null;
  to: string;
  /** Filed by hand: listed, but re-filed only when ticked (they start unticked). */
  byHand?: boolean;
  /** Already in that category: listed so the matches add up, nothing to re-file. */
  already?: boolean;
  /** Split (a shared bill): only the owner's share moves, the friends' share stays where it is. */
  split?: boolean;
}

interface Preview {
  count: number;
  already?: number;
  alreadyItems?: PreviewItem[];
  /** Bank transfers that would match too if the rule's switch were on. */
  transfersToo?: number;
  existing?: { id: string; name: string; categoryId: string } | null;
  items: PreviewItem[];
}

async function hub<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/money-hub/plaid${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      (data as { error?: string }).error || `The money app helper said ${res.status}`,
    );
  return data as T;
}

const day = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00`);
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(thisYear ? {} : { year: "numeric" }),
  });
};

const caps = "text-muted-foreground text-xs font-semibold uppercase tracking-[0.08em]";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The rule as a short list of plain sentences, for the review step. */
function ruleLines(v: RuleFormValues, accountName: (id: string) => string | undefined): string[] {
  const words = ruleToKeywords(v.pattern, v.matchType);
  // A long regex (a preset's) is cut: the review is for reading.
  const quote = (w: string) => `‘${w.length > 70 ? `${w.slice(0, 70)}…` : w}’`;
  const lines = [
    words
      ? `If the text contains ${words.map(quote).join(" or ")}`
      : v.matchType === "starts_with"
        ? `If the text starts with ${quote(v.pattern)}`
        : v.matchType === "exact"
          ? `If the text is exactly ${quote(v.pattern)}`
          : `If the text matches the pattern ${quote(v.pattern)}`,
  ];
  if (v.activityType) lines.push(`Type is ${v.activityType.replace("_", " ").toLowerCase()}`);
  const { amountOp, amountValue, amountValue2 } = ruleAmountPayload(v);
  if (amountOp && amountValue != null) {
    const n = (x: number) => x.toLocaleString(undefined, { maximumFractionDigits: 2 });
    const phrase = {
      eq: `is exactly ${n(amountValue)}`,
      gt: `is over ${n(amountValue)}`,
      gte: `is ${n(amountValue)} or more`,
      lt: `is under ${n(amountValue)}`,
      lte: `is ${n(amountValue)} or less`,
      between: `is between ${n(amountValue)} and ${n(amountValue2 ?? amountValue)}`,
    }[amountOp];
    lines.push(`Amount ${phrase}`);
  }
  if (v.accountId) lines.push(`Only in ${accountName(v.accountId) ?? "one account"}`);
  if (v.transfers) lines.push("Bank transfers count too");
  if (v.renameTo.trim()) lines.push(`Shown as ${quote(v.renameTo.trim())}`);
  return lines;
}

export function RuleDialogHost() {
  const offer = useSyncExternalStore(ruleOfferStore.subscribe, ruleOfferStore.get);
  if (!offer) return null;
  return (
    <RuleDialog
      key={`${offer.rule?.id ?? ""}:${offer.pattern}:${offer.categoryId}`}
      offer={offer}
      onClose={ruleOfferStore.close}
    />
  );
}

function RuleDialog({ offer, onClose }: { offer: RuleOffer; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const rule = offer.rule;
  const [step, setStep] = useState<"rule" | "review">("rule");
  const [values, setValues] = useState<RuleFormValues | null>(null);
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [showMatches, setShowMatches] = useState(false);
  const [unticked, setUnticked] = useState<Set<string>>(new Set());

  const { categoryOptions, accountOptions } = useRuleFormOptions();
  const { data: transfersOn } = useRuleTransfers();
  const { data: allRules } = useCategorizationRules();

  // The matches follow what is typed, a moment after typing stops.
  const draftKey = JSON.stringify(draft);
  const [debounced, setDebounced] = useState(draftKey);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(draftKey), 400);
    return () => clearTimeout(timer);
  }, [draftKey]);
  const live = useMemo(() => JSON.parse(debounced) as RuleDraft | null, [debounced]);

  const spending = useTaxonomy("spending_categories");
  const income = useTaxonomy("income_sources");
  const savings = useTaxonomy("savings_categories");
  const categories = useMemo(() => {
    const map = new Map<string, { name: string; color: string | null; icon: string | null }>();
    for (const c of [
      ...(spending.data?.categories ?? []),
      ...(income.data?.categories ?? []),
      ...(savings.data?.categories ?? []),
    ]) {
      map.set(c.id, { name: c.name, color: c.color ?? null, icon: c.icon ?? null });
    }
    return map;
  }, [spending.data?.categories, income.data?.categories, savings.data?.categories]);
  const { accounts } = useAccounts({ filterActive: false });
  const accountName = useMemo(
    () => new Map((accounts ?? []).map((a) => [a.id, a.name])),
    [accounts],
  );
  // Each match in its account's money (ACB and MB are VND).
  const accountCurrency = useMemo(
    () => new Map((accounts ?? []).map((a) => [a.id, a.currency])),
    [accounts],
  );

  const preview = useQuery({
    queryKey: ["money-hub", "rule-preview", live, rule?.id ?? null],
    queryFn: () => hub<Preview>("/preview-rule", { ...live, ruleId: rule?.id }),
    enabled: !!live && live.pattern.length >= 2,
  });
  // A different rule means a different list: start again with every match ticked, but the ones
  // filed by hand (owner, 10-01: they were left out, so Membership Fee's rule showed 0 matches).
  useEffect(
    () =>
      setUnticked(
        new Set((preview.data?.items ?? []).filter((it) => it.byHand).map((it) => it.id)),
      ),
    [preview.data],
  );

  const category = live ? categories.get(live.categoryId) : undefined;
  const categoryName = category?.name ?? "that category";
  // No preview without a category and words (a rule that only renames): nothing to wait for.
  const wantsPreview = !!draft;
  const settled =
    !wantsPreview || (!!live && !preview.isFetching && debounced === draftKey && !!preview.data);
  const items = preview.data?.items ?? [];
  const count = preview.data?.count ?? 0;
  const byHand = items.filter((it) => it.byHand).length;
  const already = preview.data?.already ?? 0;
  // Every match, for the list and its count: what would move, then what is in that category already.
  const shown: PreviewItem[] = [
    ...items,
    ...(preview.data?.alreadyItems ?? []).map((it) => ({ ...it, already: true })),
  ];
  const total = count + already;
  const alreadyText = already > 0 ? `${already} already filed as ${categoryName}.` : "";
  const auto = count - byHand;
  const ticked = items.filter((it) => !unticked.has(it.id));
  const existing = preview.data?.existing ?? null;
  const existingRule = existing ? (allRules ?? []).find((r) => r.id === existing.id) : undefined;
  const transfersToo = !live?.transfers ? (preview.data?.transfersToo ?? 0) : 0;
  const transfersHint =
    transfersToo > 0
      ? ` ${plural(transfersToo, "bank transfer")} ${transfersToo === 1 ? "matches" : "match"} too: switch on “Also match bank transfers” to include ${transfersToo === 1 ? "it" : "them"}.`
      : "";

  const make = async () => {
    if (!values) return;
    setBusy(true);
    try {
      const { amountOp, amountValue, amountValue2 } = ruleAmountPayload(values);
      const payload = {
        name: values.name,
        pattern: values.pattern,
        matchType: values.matchType,
        taxonomyId: values.taxonomyId || null,
        categoryId: values.categoryId || null,
        activityType: values.activityType || null,
        amountOp,
        amountValue,
        amountValue2,
        priority: values.priority,
        // Always sent explicitly: null clears the column, an id sets it, and the backend rejects an
        // isGlobal/accountId pair that disagrees.
        isGlobal: values.accountId === null,
        accountId: values.accountId,
      };
      const saved = rule
        ? await updateCategorizationRule(rule.id, payload)
        : await createCategorizationRule(payload);
      qc.invalidateQueries({ queryKey: [QueryKeys.SPENDING_RULES] });
      // The rename and the bank transfers switch live in the money-hub service; the switch is saved
      // before the re-file below because that run reads it.
      await saveRuleRename(qc, saved.id, values.renameTo).catch(() =>
        toast.error("The new name could not be saved."),
      );
      await saveRuleTransfers(qc, saved.id, !!values.transfers).catch((e) =>
        toast.error((e as Error).message),
      );
      const verb = rule ? "Rule saved." : "Rule created.";
      if (!wantsPreview) {
        toast.success(verb);
      } else {
        const done = await hub<{ changed: number }>("/apply-rule", {
          ruleId: saved.id,
          ids: ticked.map((it) => it.id),
        }).catch(() => null);
        invalidateSpendingCaches(qc);
        toast.success(
          done == null
            ? `${verb} Transactions like it are filed within a minute.`
            : done.changed > 0
              ? `${verb} ${done.changed} filed as ${categoryName}.`
              : `${verb} New transactions like it will be filed.`,
        );
      }
      offer.onDone?.();
      onClose();
    } catch (e) {
      toast.error(`The rule was not saved: ${(e as Error)?.message ?? String(e)}`);
      setBusy(false);
    }
  };

  const catBadge = (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
      style={{
        backgroundColor: category?.color ? `${category.color}26` : "var(--muted)",
        color: category?.color ?? undefined,
      }}
    >
      <CategoryIcon icon={category?.icon ?? null} fallback={categoryName} className="h-5 w-5" />
    </span>
  );

  const matchesList = (withTicks: boolean) => (
    <div className="max-h-[45dvh] divide-y overflow-y-auto">
      {shown.map((it) => {
        const from = it.from ? categories.get(it.from) : undefined;
        return (
          <label
            key={it.id}
            className={`flex items-center gap-3 px-3 py-2.5 ${withTicks ? "cursor-pointer" : ""}`}
          >
            <span className="shrink-0" style={{ color: from?.color ?? undefined }}>
              <CategoryIcon icon={from?.icon ?? null} fallback={from?.name} className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{it.notes}</span>
              <span className="text-muted-foreground block truncate text-xs">
                {[
                  day(it.date),
                  accountName.get(it.accountId),
                  it.already
                    ? `already ${from?.name ?? categoryName}`
                    : from
                      ? `now ${from.name}${it.byHand ? ", filed by hand" : ""}`
                      : "no category now",
                  it.split && !it.already ? "split: only your share moves" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <span className="shrink-0 text-sm tabular-nums">
              <PrivacyAmount
                value={Math.abs(it.amount)}
                currency={accountCurrency.get(it.accountId) || "USD"}
              />
            </span>
            {withTicks && !it.already ? (
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

  const status = !wantsPreview
    ? "Words and a category show the matching transactions here."
    : preview.isError
      ? `The matches could not load: ${(preview.error as Error).message}`
      : !settled
        ? "Looking for transactions like it"
        : existing
          ? `You already have a rule for these words: ${existing.name}, filing as ${categories.get(existing.categoryId)?.name ?? "its category"}. ${total ? `It matches ${plural(total, "transaction")}${count === 0 ? ", all filed that way already" : ""}. ` : ""}`
          : count === 0
            ? already > 0
              ? `${alreadyText} New ones like it will get this category too.${transfersHint}`
              : `No other transaction matches yet. New ones like it will get this category.${transfersHint}`
            : [
                auto > 0
                  ? `${plural(auto, "transaction")} would be re-filed as ${categoryName}.`
                  : "",
                byHand > 0
                  ? `${byHand} ${auto > 0 ? "more " : ""}you filed by hand ${byHand === 1 ? "matches" : "match"} too: ${byHand === 1 ? "it stays" : "they stay"} unless you tick ${byHand === 1 ? "it" : "them"} in the review.`
                  : "",
                alreadyText,
                transfersHint.trim(),
              ]
                .filter(Boolean)
                .join(" ");

  const previewSlot = (
    <div className="space-y-2">
      <div className="text-muted-foreground flex items-start gap-2 text-xs">
        {preview.isFetching && wantsPreview ? (
          <Icons.Spinner className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : null}
        <p>
          {status}
          {existing && existingRule ? (
            <>
              {" "}
              <button
                type="button"
                className="text-foreground underline underline-offset-2"
                onClick={() =>
                  ruleOfferStore.open({
                    rule: existingRule,
                    pattern: "",
                    taxonomyId: "",
                    categoryId: "",
                  })
                }
              >
                Open that rule
              </button>
            </>
          ) : null}
        </p>
      </div>
      {showMatches && settled && total > 0 ? (
        <div className="rounded-lg border">{matchesList(false)}</div>
      ) : null}
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] gap-3 overflow-y-auto p-4 sm:max-w-[560px]">
        {/* The form stays mounted behind the review, so Back finds everything as it was typed. */}
        <div className={step === "rule" ? "space-y-3" : "hidden"}>
          <DialogHeader>
            <DialogTitle>
              {rule ? t("spending:rules.editTitle") : t("spending:rules.addTitle")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("spending:rules.editDescription")}
            </DialogDescription>
          </DialogHeader>
          <RuleForm
            rule={rule}
            categoryOptions={categoryOptions}
            accountOptions={accountOptions}
            start={{
              words: offer.pattern ? [offer.pattern] : [],
              category:
                offer.taxonomyId && offer.categoryId
                  ? `${offer.taxonomyId}:${offer.categoryId}`
                  : "",
              transfers: rule ? !!transfersOn?.[rule.id] : false,
            }}
            onDraft={setDraft}
            onSubmit={(v) => {
              setValues(v);
              setStep("review");
            }}
            onCancel={onClose}
            preview={previewSlot}
            footerExtra={
              wantsPreview ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowMatches((v) => !v)}
                  disabled={!settled || total === 0}
                >
                  {showMatches && total > 0
                    ? "Hide matches"
                    : `Preview ${settled ? total : "…"} ${total === 1 ? "match" : "matches"}`}
                </Button>
              ) : null
            }
            submitLabel="Review rule"
            submitDisabled={!settled || (wantsPreview && (preview.isError || !!existing))}
          />
        </div>

        {step === "review" && values ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="-ml-2 h-8 w-8"
                  onClick={() => setStep("rule")}
                  disabled={busy}
                  aria-label="Back to the rule"
                >
                  <Icons.ChevronLeft className="h-4 w-4" />
                </Button>
                <DialogTitle className={caps}>Preview the updates</DialogTitle>
              </div>
              <DialogDescription className="sr-only">
                The rule and the transactions it will re-file.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 rounded-xl border p-4">
              <div className="bg-muted space-y-1 rounded-lg px-4 py-3 text-sm">
                {ruleLines(values, (id) => accountName.get(id)).map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
              {wantsPreview ? (
                <>
                  <div className="flex items-center justify-between gap-3 border-b pb-4">
                    <div className="min-w-0">
                      <div className="text-muted-foreground text-sm">Category</div>
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <span className="text-muted-foreground" aria-hidden="true">
                          ↳
                        </span>
                        <span className="truncate">{categoryName}</span>
                      </div>
                    </div>
                    {catBadge}
                  </div>
                  <p className="text-sm">
                    The following transactions and future matches will be filed under this category:
                  </p>
                  <div className="rounded-lg border">
                    <div className="flex items-center justify-between gap-3 border-b px-3 py-2.5">
                      <span className={caps}>{plural(total, "transaction")} matched</span>
                      {items.length > 0 ? (
                        <label className={`${caps} flex cursor-pointer items-center gap-3`}>
                          Select all
                          <Checkbox
                            checked={unticked.size === 0}
                            onCheckedChange={(v) =>
                              setUnticked(
                                v === true ? new Set() : new Set(items.map((it) => it.id)),
                              )
                            }
                            aria-label="Select all"
                          />
                        </label>
                      ) : null}
                    </div>
                    {shown.length > 0 ? (
                      matchesList(true)
                    ) : (
                      <p className="text-muted-foreground px-3 py-4 text-sm">
                        None yet. New transactions like it will be filed as they come in.
                      </p>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            <div className="flex justify-end">
              <Button type="button" onClick={make} disabled={busy}>
                {busy ? <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
                {rule ? "Save rule" : "Create rule"}
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
