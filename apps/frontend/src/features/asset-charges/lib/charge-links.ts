// money-hub patch: Linked charges (owner, 2026-10-08: "we need to find an architecture that allows this and is
// easy to manage"). Which bank charges are FOR which Holdings asset (a house, a rental, a car) is set once, on the
// asset; the money-hub service keeps the rules in the asset's own details and works out whose each charge is
// (server/drive-backup/lib/chargeLinks.js). This file reads that, sends the owner's picks, and words the labels.
// Nothing here matches a charge itself: every page asks the service, so they cannot disagree.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type RuleKind = "payee" | "category" | "words";
export type Share = "mine" | "shared" | "rental";

export interface ChargeRule {
  id: string;
  kind: RuleKind;
  /** payee: a merchant id; category: a Spending category id; words: the text to look for. */
  value: string;
  /** What to call it (the merchant's name, the category's name). */
  label?: string;
  /** For Rentals: what kind of cost, and whose share. Not shown here yet. */
  cost?: string;
  share?: Share;
}

/** A rule as sent to the service: a new one has no id yet. */
export type RuleInput = Omit<ChargeRule, "id"> & { id?: string };

export interface RuleCatch {
  count: number;
  yearCount: number;
  yearTotal: number;
}

export interface LinkedCharge {
  id: string;
  date: string;
  amount: number;
  notes: string;
  ruleId: string | null;
  via: "rule" | "include";
}

export interface AssetCharges {
  id: string;
  kind: string;
  name: string;
  links: { rules: ChargeRule[]; include: string[]; exclude: string[] };
  count: number;
  total: number;
  yearCount: number;
  yearTotal: number;
  /** Charges its rules fit that another asset took. */
  lost: number;
  rules: Record<string, RuleCatch>;
  recent: LinkedCharge[];
}

export interface ChargeClaim {
  assetId: string;
  ruleId: string | null;
  via: "rule" | "include";
  amount: number;
}

export interface ChargeLinksView {
  year: string;
  assets: AssetCharges[];
  /** chargeId -> the asset it is for. */
  claims: Record<string, ChargeClaim>;
}

const BASE = "/api/money-hub/charge-links";
export const CHARGE_LINKS_KEY = ["money-hub", "charge-links"] as const;
const UPKEEP_KEY = ["money-hub", "upkeep"] as const;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      (data as { error?: string }).error || `The money app helper said ${res.status}`,
    );
  return data as T;
}

const seg = (s: string) => encodeURIComponent(s);

export const chargeLinksApi = {
  get: () => call<ChargeLinksView>("GET", ""),
  saveRules: (assetId: string, rules: RuleInput[]) =>
    call<ChargeLinksView>("PUT", `/${seg(assetId)}/rules`, { rules }),
  setCharge: (assetId: string, chargeId: string, state: "yes" | "no" | "clear") =>
    call<ChargeLinksView>("PUT", `/${seg(assetId)}/charges/${seg(chargeId)}`, { state }),
};

export function useChargeLinks(enabled = true) {
  return useQuery({
    queryKey: CHARGE_LINKS_KEY,
    queryFn: chargeLinksApi.get,
    staleTime: 2 * 60 * 1000,
    enabled,
  });
}

/** The save calls. Each answer is the whole new picture, so the page shows it at once; Maintenance's totals
 *  follow the links, so they are asked again. */
export function useChargeLinkActions(assetId: string) {
  const qc = useQueryClient();
  const done = (view: ChargeLinksView) => {
    qc.setQueryData(CHARGE_LINKS_KEY, view);
    void qc.invalidateQueries({ queryKey: UPKEEP_KEY });
    void qc.invalidateQueries({ queryKey: ["money-hub", "linked-activity-ids"] });
  };
  const saveRules = useMutation({
    mutationFn: (rules: RuleInput[]) => chargeLinksApi.saveRules(assetId, rules),
    onSuccess: done,
  });
  const setCharge = useMutation({
    mutationFn: (p: { chargeId: string; state: "yes" | "no" | "clear" }) =>
      chargeLinksApi.setCharge(assetId, p.chargeId, p.state),
    onSuccess: done,
  });
  return { saveRules, setCharge };
}

// --------------------------------------------------------------- words --

export const RULE_KIND_WORDS: Record<RuleKind, string> = {
  payee: "Payee",
  category: "Category",
  words: "Words",
};

/** What a rule is called on the card. */
export function ruleName(rule: ChargeRule): string {
  return rule.label || rule.value;
}

/** "Honda CRV" is a vehicle: the lines of help the empty card gives. */
export function emptyHelp(kind: string): string {
  if (kind === "vehicle") return "Link what you pay for this car: insurance, gas, repairs.";
  if (kind === "property") return "Link what you pay for this home: utilities, repairs, insurance.";
  return "Link the charges you pay for this asset.";
}

/** The rules as sent back to the service with one more (or one fewer). Keeps their ids. */
export function withRule(rules: ChargeRule[], next: RuleInput): RuleInput[] {
  return [...rules, next];
}

export function withoutRule(rules: ChargeRule[], id: string): RuleInput[] {
  return rules.filter((r) => r.id !== id);
}

/** A rule already on the list (the service refuses a second copy; this says so before asking). */
export function hasRule(rules: ChargeRule[], kind: RuleKind, value: string): boolean {
  const norm = (s: string) => s.toUpperCase().replace(/\s+/g, " ").trim();
  return rules.some((r) => r.kind === kind && norm(r.value) === norm(value));
}

// ---------------------------------------------------------- transactions --

/** The asset a charge is for, if any: its claim and the asset's name. */
export function claimOf(view: ChargeLinksView | undefined, chargeId: string) {
  const claim = view?.claims[chargeId];
  if (!claim) return null;
  const asset = view?.assets.find((a) => a.id === claim.assetId);
  return asset ? { claim, asset } : null;
}

/** The charges linked to the chosen assets, for the Transactions filter (nothing chosen: no filter). */
export function chargeIdsFor(view: ChargeLinksView, assetIds: Set<string>): string[] {
  return Object.entries(view.claims)
    .filter(([, c]) => assetIds.has(c.assetId))
    .map(([id]) => id);
}

/** Assets that have anything linked, as filter options. */
export function assetFilterOptions(view: ChargeLinksView | undefined): { value: string; label: string }[] {
  return (view?.assets ?? [])
    .filter((a) => a.count > 0)
    .map((a) => ({ value: a.id, label: a.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
