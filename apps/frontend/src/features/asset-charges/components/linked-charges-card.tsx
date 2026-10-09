// money-hub patch: the Linked charges card on an asset's Holdings page, the ONE place to say which bank charges
// are for this asset (owner, 2026-10-08: "easy to manage"). A rule names a payee (State Farm), a category
// (Housing / Utilities) or words in the bank text; the card shows what each rule catches this year and the latest
// charges it linked, and one tap says "not this one". Maintenance, Transactions and Rentals read the same link.
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button, Icons, Input, PrivacyAmount } from "@wealthfolio/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";

import { useTaxonomy } from "@/hooks/use-taxonomies";
import { cn } from "@/lib/utils";

import { SPENDING_TAXONOMY } from "@/features/spending/hooks/use-rule-form-options";
import { useMerchants } from "@/features/spending/lib/merchants";
import { shortDay } from "@/features/upkeep/lib/upkeep";

import {
  COST_WORDS,
  RULE_KIND_WORDS,
  SHARE_WORDS,
  emptyHelp,
  hasRule,
  ruleName,
  useChargeLinkActions,
  useChargeLinks,
  withCostShare,
  withRule,
  withoutRule,
  type ChargeRule,
  type LinkedCharge,
  type RuleInput,
  type RuleKind,
  type Share,
} from "../lib/charge-links";

const KIND_ICON: Record<RuleKind, typeof Icons.Store> = {
  payee: Icons.Store,
  category: Icons.Tag,
  words: Icons.Search,
};

const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save that.");

export function LinkedChargesCard({
  assetId,
  kind,
  currency,
  rental = false,
}: {
  assetId: string;
  kind: string;
  currency: string;
  /** A home that is rented: each rule also says what kind of cost it is and whose, for the Rentals page. */
  rental?: boolean;
}) {
  const view = useChargeLinks();
  const asset = view.data?.assets.find((a) => a.id === assetId);
  const { saveRules, setCharge } = useChargeLinkActions(assetId);
  const [adding, setAdding] = useState(false);
  const busy = saveRules.isPending || setCharge.isPending;

  const rules = asset?.links.rules ?? [];
  const remove = (r: ChargeRule) => saveRules.mutate(withoutRule(rules, r.id), { onError: fail });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="min-w-0">
          <CardTitle className="text-md">Linked charges</CardTitle>
          {asset && asset.count > 0 ? (
            <p className="text-muted-foreground text-xs">
              {asset.yearCount} this year ·{" "}
              <PrivacyAmount value={Math.round(asset.yearTotal)} currency={currency} />
              {asset.lost > 0 ? ` · ${asset.lost} went to another asset` : ""}
            </p>
          ) : null}
        </div>
        {!adding ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            onClick={() => setAdding(true)}
            disabled={!asset}
          >
            <Icons.Plus className="size-4" aria-hidden />
            Add
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-1 pb-3">
        {view.isError ? (
          <p className="text-muted-foreground text-sm">Could not read the linked charges.</p>
        ) : !asset ? (
          <p className="text-muted-foreground text-sm">Looking at your charges…</p>
        ) : (
          <>
            {adding ? (
              <AddRule
                rules={rules}
                busy={busy}
                rental={rental}
                onCancel={() => setAdding(false)}
                onAdd={(rule) =>
                  saveRules.mutate(withRule(rules, rule), {
                    onSuccess: () => setAdding(false),
                    onError: fail,
                  })
                }
              />
            ) : null}
            {rules.length === 0 && !adding ? (
              <p className="text-muted-foreground py-1 text-sm">{emptyHelp(kind)}</p>
            ) : null}
            {rules.map((r) => {
              const Icon = KIND_ICON[r.kind];
              const c = asset.rules[r.id];
              return (
                <div
                  key={r.id}
                  className={cn(
                    "grid min-h-8 grid-cols-[18px_minmax(0,1fr)_auto_24px] items-center gap-x-2 text-sm",
                    rental && "md:grid-cols-[18px_minmax(0,1fr)_auto_auto_auto_24px]",
                  )}
                >
                  <Icon className="text-muted-foreground size-4" aria-hidden />
                  <span className="truncate">
                    {ruleName(r)}
                    <span className="text-muted-foreground ml-1.5 text-xs">{RULE_KIND_WORDS[r.kind]}</span>
                  </span>
                  {rental ? (
                    <div className="col-span-3 col-start-2 row-start-2 flex flex-wrap gap-1 pb-1 md:contents">
                      <CostShare
                        cost={r.cost ?? "other"}
                        share={r.share ?? "usual"}
                        disabled={busy}
                        onChange={(cost, share) =>
                          saveRules.mutate(withCostShare(rules, r.id, cost, share), { onError: fail })
                        }
                      />
                    </div>
                  ) : null}
                  <span className={cn("text-muted-foreground text-xs tabular-nums", rental && "col-start-3 row-start-1 md:col-auto md:row-auto")}>
                    {c ? (
                      <>
                        {c.yearCount} this year ·{" "}
                        <PrivacyAmount value={Math.round(c.yearTotal)} currency={currency} />
                      </>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${ruleName(r)}`}
                    title="Remove this rule"
                    disabled={busy}
                    onClick={() => remove(r)}
                    className={cn(
                      "text-muted-foreground hover:text-foreground flex size-6 items-center justify-center rounded-md disabled:opacity-50",
                      rental && "col-start-4 row-start-1 md:col-auto md:row-auto",
                    )}
                  >
                    <Icons.X className="size-4" aria-hidden />
                  </button>
                </div>
              );
            })}
            {asset.recent.length ? (
              <div className="border-border mt-2 border-t pt-2">
                <p className="text-muted-foreground pb-1 text-xs">Latest linked</p>
                {asset.recent.slice(0, 6).map((c) => (
                  <RecentRow
                    key={c.id}
                    charge={c}
                    currency={currency}
                    busy={busy}
                    onNot={() =>
                      setCharge.mutate(
                        { chargeId: c.id, state: c.via === "include" ? "clear" : "no" },
                        { onError: fail },
                      )
                    }
                  />
                ))}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RecentRow({
  charge,
  currency,
  busy,
  onNot,
}: {
  charge: LinkedCharge;
  currency: string;
  busy: boolean;
  onNot: () => void;
}) {
  return (
    <div className="grid min-h-8 grid-cols-[56px_minmax(0,1fr)_auto_24px] items-center gap-2 text-sm">
      <span className="text-muted-foreground text-xs">{shortDay(charge.date)}</span>
      <span className="truncate">
        {charge.notes}
        {charge.via === "include" ? (
          <span className="text-muted-foreground ml-1.5 text-xs">picked</span>
        ) : null}
      </span>
      <span className="tabular-nums">
        <PrivacyAmount value={charge.amount} currency={currency} />
      </span>
      <button
        type="button"
        aria-label="Not for this asset"
        title={charge.via === "include" ? "Take it off again" : "Not this one"}
        disabled={busy}
        onClick={onNot}
        className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center rounded-md disabled:opacity-50"
      >
        <Icons.X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/** Rentals: what kind of cost a rule is and whose it is. */
function CostShare({
  cost,
  share,
  disabled,
  onChange,
}: {
  cost: string;
  share: string;
  disabled?: boolean;
  onChange: (cost: string, share: string) => void;
}) {
  const trigger = "h-6! min-h-0! w-auto gap-1 px-2 py-0! text-xs md:h-7!";
  return (
    <>
      <Select value={cost} onValueChange={(v) => onChange(v, share)} disabled={disabled}>
        <SelectTrigger className={trigger} aria-label="Counts as">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {Object.entries(COST_WORDS).map(([v, label]) => (
            <SelectItem key={v} value={v}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={share} onValueChange={(v) => onChange(cost, v)} disabled={disabled}>
        <SelectTrigger className={trigger} aria-label="Whose cost">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value="usual">Usual share</SelectItem>
          {Object.entries(SHARE_WORDS).map(([v, label]) => (
            <SelectItem key={v} value={v}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

function AddRule({
  rules,
  busy,
  rental,
  onAdd,
  onCancel,
}: {
  rules: ChargeRule[];
  busy: boolean;
  rental: boolean;
  onAdd: (rule: RuleInput) => void;
  onCancel: () => void;
}) {
  const [cost, setCost] = useState("other");
  const [share, setShare] = useState("usual");
  const [kind, setKind] = useState<RuleKind>("payee");
  const [pick, setPick] = useState("");
  const [text, setText] = useState("");
  const merchants = useMerchants();
  const taxonomy = useTaxonomy(SPENDING_TAXONOMY);

  const payees = useMemo(
    () =>
      (merchants.data ?? [])
        .filter((m) => !m.source)
        .map((m) => ({ value: m.id, label: m.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [merchants.data],
  );
  const categories = useMemo(() => {
    const all = taxonomy.data?.categories ?? [];
    const byId = new Map(all.map((c) => [c.id, c]));
    return all
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => {
        const parent = c.parentId ? byId.get(c.parentId) : null;
        return { value: c.id, label: parent ? `${parent.name} / ${c.name}` : c.name };
      });
  }, [taxonomy.data?.categories]);

  const options = kind === "payee" ? payees : categories;
  const value = kind === "words" ? text.trim() : pick;
  const ready = value.length > 0;

  const submit = () => {
    if (!ready) return;
    if (hasRule(rules, kind, value)) {
      toast.error("That is already a rule.");
      return;
    }
    const label = kind === "words" ? undefined : options.find((o) => o.value === pick)?.label;
    onAdd({
      kind,
      value,
      ...(label ? { label } : {}),
      ...(rental ? { cost, ...(share !== "usual" ? { share: share as Share } : {}) } : {}),
    });
  };

  return (
    <div className="bg-muted/40 mb-2 space-y-2 rounded-lg p-2">
      <div className="flex gap-1" role="radiogroup" aria-label="What to link by">
        {(Object.keys(RULE_KIND_WORDS) as RuleKind[]).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => {
              setKind(k);
              setPick("");
            }}
            className={cn(
              "h-8 rounded-md px-3 text-sm",
              kind === k ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {RULE_KIND_WORDS[k]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-48">
          {kind === "words" ? (
            <Input
              value={text}
              placeholder="Words in the bank text, like GEICO"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              aria-label="Words to look for"
              maxLength={80}
            />
          ) : (
            <Select value={pick} onValueChange={setPick}>
              <SelectTrigger aria-label={kind === "payee" ? "Payee" : "Category"}>
                <SelectValue placeholder={kind === "payee" ? "Choose a payee" : "Choose a category"} />
              </SelectTrigger>
              <SelectContent position="popper" className="max-h-72">
                {options.length ? (
                  options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))
                ) : (
                  <div className="text-muted-foreground px-2 py-1.5 text-sm">
                    {kind === "payee" ? "No payees yet. Use Words." : "No categories."}
                  </div>
                )}
              </SelectContent>
            </Select>
          )}
        </div>
        {rental ? (
          <div className="flex basis-full flex-wrap gap-1.5">
            <CostShare cost={cost} share={share} onChange={(c, s) => { setCost(c); setShare(s); }} />
          </div>
        ) : null}
        <Button type="button" size="sm" className="h-8" disabled={!ready || busy} onClick={submit}>
          Add
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
