// money-hub patch: Taxes (owner, 2026-10-02: "plan a new feature, taxes management"). One page per tax
// year from what the money app and WheelTradr already hold: the trading profit that is taxed, what was
// paid and for which year, the year's dates, the papers to expect, and gifts in and out (the two forms).
// The money-hub service works it all out (server/drive-backup/lib/taxes.js); this file reads it, sends
// the owner's picks, and words the small labels. It files nothing: an estimate to plan with.
import { useQuery, useQueryClient } from "@tanstack/react-query";

export type Treatment = "taxed" | "not_taxed" | "not_mine";
export type TaxAlertKind = "date" | "paper" | "moved" | "safe";
export type FilingStatus = "single" | "head" | "joint" | "separate";

export interface TaxAccount {
  id: string;
  name: string;
  broker: string | null;
  logoUrl: string | null;
  /** The year's realized profit: trades closed, plus dividends, interest and fees. */
  realized: number;
  shortTerm: number;
  longTerm: number;
  /** Dividends, interest and fees. */
  other: number;
  closedTrades: number;
  treatment: Treatment;
  /** Read from the account's name, not picked by the owner. */
  guessed: boolean;
  /** What the open positions are up or down right now; null when WheelTradr did not say. */
  openPnl: number | null;
}

export interface TaxPayment {
  id: string;
  date: string;
  /** Paid out is positive; money the tax office sent back is negative. */
  amount: number;
  account: string | null;
  who: "federal" | "state" | "property" | "other";
  name: string;
  taxYear: number;
  /** False while the date fits two tax years and the owner has not said which. */
  sure: boolean;
  picked: boolean;
}

export interface TaxDate {
  key: string;
  kind: "pay" | "paper" | "file";
  date: string;
  label: string;
  days: number;
  past: boolean;
  /** For a payment date and the return's own date: what was sent by then. */
  sent: number | null;
}

export interface TaxPaper {
  key: string;
  form: string;
  from: string;
  expected: string;
  got: boolean;
  link: string | null;
  late: boolean;
  /** A form the owner fills in, not one that arrives. */
  fill?: boolean;
  /** Added by the owner. */
  own?: boolean;
}

export interface GiftIn {
  id: string;
  date: string;
  amount: number;
  account: string | null;
  from: string;
  counted: boolean;
}

export interface GiftOut {
  id: string;
  date: string;
  amount: number;
  account: string | null;
  /** A gift, the owner's own money moving (false), or not said yet (null). */
  gift: boolean | null;
  to: string;
  /** The person the app would name: the wire landed in their account. */
  offered: string;
  landedIn: string | null;
  picked: boolean;
}

export interface TaxLook {
  key: string;
  tone: "warn" | "plain";
  title: string;
  amount?: number;
  text: string;
}

/** The owner's answers for the April estimate. */
export interface TaxSetup {
  status: FilingStatus | null;
  /** A pay stub's year-to-date figures. */
  stub: { date: string; wages: number; federal: number; state: number } | null;
  /** The owner's own full-year figures, each optional; they win over the stub scaled up. */
  full: { wages: number | null; federal: number | null; state: number | null } | null;
  /** Last year's return: its total tax and income, whether it was joint, and the owner's share of the tax. */
  last: { tax: number; agi: number; joint: boolean; share: number | null } | null;
  /** The rental's depreciation and other costs for the year. */
  rentalExtra: number | null;
  /** Hold the set-aside back in Cash & cards. */
  hold: boolean;
  hasRental: boolean;
  paydays: number;
  paydaysLeft: number;
}

/** The April number: what the year's tax comes to, what is paid, what is left, and whether it is penalty-safe. */
export interface TaxEstimate {
  status: FilingStatus;
  income: {
    wages: number;
    short: number;
    long: number;
    lossUsed: number;
    lossCarried: number;
    interest: number;
    rental: {
      rent: number;
      costs: number;
      extra: number;
      net: number;
      used: number;
      held: number;
    } | null;
    total: number;
  };
  deduction: { kind: "standard" | "itemized"; amount: number; standard: number };
  federal: { taxable: number; tax: number; investment: number; total: number; rate: number };
  state: { tax: number; exemption: number; credit: number };
  paid: {
    federalWithheld: number;
    stateWithheld: number;
    federalSent: number;
    stateSent: number;
    federal: number;
    state: number;
  };
  /** Owed is positive. `total` adds up only what is owed; `back` only what comes back. */
  balance: { federal: number; state: number; total: number; back: number };
  safe: {
    ok: boolean;
    /** Which test decides: owing under $1,000, 90% of this year's tax, or last year's tax. */
    by: "small" | "current" | "prior";
    required: number;
    paid: number;
    shortfall: number;
    perPaycheck: number | null;
    paychecksLeft: number;
    lumpBy: string | null;
    priorKnown: boolean;
    /** Last year's return was joint and the owner's share is not typed in: the whole tax is used, the safer reading. */
    priorJointGuess: boolean;
  };
  stubDate: string;
  stubAge: number;
  dueBy: string | null;
  /** WheelTradr's numbers were not answering: trading profit is not in the estimate. */
  tradingMissing: boolean;
}

export interface TaxesView {
  year: number;
  years: number[];
  today: string;
  currency: string;
  trading: {
    accounts: TaxAccount[];
    taxed: number;
    shortTerm: number;
    longTerm: number;
    other: number;
    notTaxed: number;
    notMine: number;
    asOf: string | null;
    /** "not-connected", "old" (WheelTradr has no yearly numbers yet), or its own words; null when fine. */
    error: string | null;
  };
  paid: { federal: number; state: number; total: number; rows: TaxPayment[] };
  dates: TaxDate[];
  papers: { rows: TaxPaper[]; got: number; count: number; late: number };
  gifts: {
    received: { total: number; count: number; limit: number; over: boolean; rows: GiftIn[] };
    sent: {
      total: number;
      limit: number;
      over: boolean;
      people: { name: string; total: number; count: number; over: boolean }[];
      rows: GiftOut[];
      unsorted: { count: number; total: number };
      /** False when even every wire still to sort could not push anyone past the yearly limit. */
      matters: boolean;
    };
  };
  looks: TaxLook[];
  /** Null until the owner has given a filing status and a pay stub (see `needs`). */
  estimate: TaxEstimate | null;
  /** What the estimate still needs: "table" (the year's figures are not in the app), "status", "stub". */
  needs: string[];
  setup: TaxSetup;
  driveFolder: string | null;
  /** Each kind's switch, and `on` for the whole group (Settings, Alerts). */
  alerts: Record<TaxAlertKind, boolean> & { on?: boolean };
}

const BASE = "/api/money-hub/taxes";
export const TAXES_KEY = ["money-hub", "taxes"] as const;
export const taxesKey = (year: number | null) => [...TAXES_KEY, year ?? "now"] as const;

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

const seg = (s: string | number) => encodeURIComponent(String(s));

/** What the setup form sends: amounts as typed (the service checks them), empty = not given. */
export interface SetupPatch {
  status?: FilingStatus;
  stub?: { date: string; wages: string | number; federal: string | number; state: string | number };
  full?: {
    wages: string | number | null;
    federal: string | number | null;
    state: string | number | null;
  } | null;
  last?: {
    tax: string | number | null;
    agi: string | number | null;
    joint: boolean;
    share: string | number | null;
  } | null;
  rentalExtra?: string | number | null;
  hold?: boolean;
}
type Went = { went: { discord: boolean; ntfy: boolean }; sample: string };

export const taxesApi = {
  get: (year: number | null) => call<TaxesView>("GET", year ? `?year=${year}` : ""),
  /** How an account is taxed; null goes back to the reading of its name. */
  setAccount: (year: number, id: string, treatment: Treatment | null) =>
    call<TaxesView>("PUT", `/accounts/${seg(id)}`, { treatment, year }),
  /** Which tax year a payment was for; null goes back to the guess from its date. */
  setPayment: (year: number, id: string, taxYear: number | null) =>
    call<TaxesView>("PUT", `/payments/${seg(id)}`, { taxYear, year }),
  setPaper: (year: number, key: string, patch: { got?: boolean; link?: string | null }) =>
    call<TaxesView>("PUT", `/papers/${year}/${seg(key)}`, patch),
  addPaper: (year: number, paper: { form: string; from: string }) =>
    call<TaxesView>("POST", `/papers/${year}`, paper),
  removePaper: (year: number, key: string) =>
    call<TaxesView>("DELETE", `/papers/${year}/${seg(key)}`),
  /** Money in: counted as a gift from abroad or not. */
  setGiftIn: (year: number, id: string, counted: boolean) =>
    call<TaxesView>("PUT", `/gifts/in/${seg(id)}`, { counted, year }),
  /** A wire out: a gift to someone, or the owner's own money moving. */
  setGiftOut: (year: number, id: string, pick: { gift: boolean; to?: string }) =>
    call<TaxesView>("PUT", `/gifts/out/${seg(id)}`, { ...pick, year }),
  setDriveFolder: (year: number, url: string) =>
    call<TaxesView>("PUT", "/drive-folder", { url, year }),
  /** The April estimate's answers, any of them at a time. */
  setSetup: (year: number, patch: SetupPatch) => call<TaxesView>("PUT", `/setup/${year}`, patch),
  setAlerts: (alerts: Partial<Record<TaxAlertKind | "on", boolean>>) =>
    call<TaxesView>("PUT", "/alerts", alerts),
  /** A sample of one kind of alert, sent the way the real one goes. */
  testAlert: (kind: TaxAlertKind) => call<TaxesView & Went>("POST", "/alerts/test", { kind }),
};

export function useTaxes(year: number | null) {
  return useQuery({
    queryKey: taxesKey(year),
    queryFn: () => taxesApi.get(year),
    staleTime: 60 * 1000,
  });
}

/**
 * Puts a fresh view where the page reads it: under its own year, and as "now" when it is this year's.
 * The other years are read again when next shown: a payment moved to another tax year, or an account
 * marked not mine, changes them too.
 */
export function useSetTaxes() {
  const qc = useQueryClient();
  return (view: TaxesView) => {
    const current = view.year === Number(view.today.slice(0, 4));
    qc.setQueryData(taxesKey(view.year), view);
    if (current) qc.setQueryData(taxesKey(null), view);
    void qc.invalidateQueries({
      predicate: (q) =>
        q.queryKey[0] === TAXES_KEY[0] &&
        q.queryKey[1] === TAXES_KEY[1] &&
        q.queryKey[2] !== view.year &&
        !(current && q.queryKey[2] === "now"),
    });
  };
}

export const TREATMENT_LABELS: Record<Treatment, string> = {
  taxed: "taxed",
  not_taxed: "not taxed",
  not_mine: "not mine",
};
export const TREATMENT_HINTS: Record<Treatment, string> = {
  taxed: "Its profit is on your tax return",
  not_taxed: "A retirement or health account: nothing owed this year",
  not_mine: "Someone else's account: left out of your numbers",
};

export const TAX_ALERT_LABELS: Record<TaxAlertKind, { title: string; text: string }> = {
  date: {
    title: "A tax date is a week away",
    text: "Payment dates, the papers' arrival and the return's own date.",
  },
  paper: {
    title: "Papers still missing",
    text: "Ten days after a form was due to arrive and it is not ticked off.",
  },
  moved: {
    title: "The April estimate moved",
    text: "What to set aside went up or down by $500 or more.",
  },
  safe: {
    title: "Penalty-safe changed",
    text: "Enough is paid in to stay clear of the underpayment penalty, or not any more.",
  },
};

export const STATUS_LABELS: Record<FilingStatus, string> = {
  single: "Single",
  head: "Head of household",
  joint: "Married, filing together",
  separate: "Married, filing apart",
};

/** An amount as typed ("$98,000.50") as a plain number string; empty stays empty. */
export const typedAmount = (v: string): string => v.replace(/[$,\s]/g, "");

/** How to get penalty-safe, in words: more from each paycheck left, or one payment. `short` = keywords, for a phone. */
export function fixWords(
  safe: TaxEstimate["safe"],
  money: (n: number) => string,
  short = false,
): string {
  const by = safe.lumpBy ? ` by ${shortDay(safe.lumpBy)}` : "";
  if (short)
    return safe.perPaycheck
      ? `${money(safe.perPaycheck)} more per paycheck (${safe.paychecksLeft} left), or ${money(safe.shortfall)}${by}`
      : `${money(safe.shortfall)}${by}`;
  const lump = `one payment of ${money(safe.shortfall)}${by}`;
  return safe.perPaycheck
    ? `${money(safe.perPaycheck)} more from each of the ${safe.paychecksLeft} paychecks left, or ${lump}`
    : lump;
}

/** One line of "How it adds up"; a `total` line is a sum the lines above lead to. */
export interface SumLine {
  label: string;
  value: number;
  hint?: string;
  total?: boolean;
}

/** The estimate as the lines of a sum, top to bottom (pure). */
export function sumLines(e: TaxEstimate, year: number, setup: TaxSetup): SumLine[] {
  const out: SumLine[] = [];
  out.push({
    label: "Pay for the year",
    value: e.income.wages,
    hint:
      setup.full?.wages != null
        ? "your own full-year figure"
        : `the ${shortDay(e.stubDate)} stub, carried to ${setup.paydays || "all"} paychecks`,
  });
  if (e.income.short)
    out.push({
      label: "Trading profit, held under a year",
      value: e.income.short,
      hint: "taken so far",
    });
  if (e.income.long)
    out.push({
      label: "Trading profit, held over a year",
      value: e.income.long,
      hint: "taken so far, taxed at lower rates",
    });
  if (e.income.lossUsed)
    out.push({
      label: "Trading loss",
      value: -e.income.lossUsed,
      hint: e.income.lossCarried ? "the limit for one year, the rest carries on" : undefined,
    });
  if (e.income.interest)
    out.push({ label: "Interest and dividends", value: e.income.interest, hint: "so far" });
  if (e.income.rental) {
    const r = e.income.rental;
    out.push({
      label: "Rental, after its costs",
      value: r.used,
      hint:
        r.held > 0
          ? "a loss this size cannot be used this year"
          : r.extra > 0
            ? "rent less its share of the mortgage, and your depreciation"
            : "rent less its share of the mortgage, no depreciation typed in",
    });
  }
  out.push({ label: "Income", value: e.income.total, total: true });
  out.push({
    label: e.deduction.kind === "itemized" ? "Deduction, itemized" : "Standard deduction",
    value: -e.deduction.amount,
    hint: e.deduction.kind === "itemized" ? "home interest, state and property tax" : undefined,
  });
  out.push({
    label: "Federal tax",
    value: e.federal.total,
    hint:
      e.federal.investment > 0
        ? "with the 3.8% on investment income"
        : `the next dollar is taxed at ${Math.round(e.federal.rate * 100)}%`,
    total: true,
  });
  out.push({ label: "Illinois tax", value: e.state.tax, total: true });
  out.push({
    label: "Taken out of paychecks by Dec 31",
    value: -(e.paid.federalWithheld + e.paid.stateWithheld),
  });
  if (e.paid.federalSent || e.paid.stateSent)
    out.push({ label: `Sent for ${year}`, value: -(e.paid.federalSent + e.paid.stateSent) });
  if (e.balance.back > 0 && e.balance.total > 0)
    out.push({
      label: "Coming back",
      value: e.balance.back,
      hint:
        e.balance.federal < 0
          ? "federal, not netted against Illinois"
          : "Illinois, not netted against federal",
    });
  return out;
}

/** "Jan 15", and with the year when asked ("Jan 15, 2027"). */
export function shortDay(iso: string, withYear = false): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/** "105 days", "tomorrow", "today"; past dates say nothing here (the row words them). */
export function inDays(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `${days} days`;
}

/** The names of a list, in words: "A", "A and B", "A, B and C". */
export function listed(names: string[]): string {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The two tax years a payment's date can belong to (the one it was paid in, and the one before). */
export const yearChoices = (p: Pick<TaxPayment, "date">): number[] => {
  const y = Number(p.date.slice(0, 4));
  return [y - 1, y];
};

/** The hero's split bar: only what is above zero has a share. */
export function barParts(t: TaxesView["trading"]): { key: string; value: number; color: string }[] {
  return [
    { key: "short", value: t.shortTerm, color: "var(--m-forest)" },
    { key: "long", value: t.longTerm, color: "var(--m-forest-today)" },
    { key: "other", value: t.other, color: "var(--m-forest-soft)" },
    { key: "free", value: t.notTaxed, color: "var(--m-bills)" },
  ].filter((p) => p.value > 0);
}

/** Names already used for gifts, most money first, for quick picks when sorting a wire. */
export function knownPeople(rows: GiftOut[]): string[] {
  const seen = new Map<string, { name: string; total: number }>();
  for (const r of rows) {
    for (const name of [r.gift ? r.to : "", r.offered]) {
      const key = name.trim().toLowerCase();
      if (!key) continue;
      const hit = seen.get(key) ?? { name: name.trim(), total: 0 };
      hit.total += r.amount;
      seen.set(key, hit);
    }
  }
  return [...seen.values()].sort((a, b) => b.total - a.total).map((p) => p.name);
}
