// money-hub patch: the gear on Amazon orders and TikTok Shop orders (owner, 2026-10-04: "yes add the gear to amazon and
// tiktok too"; before that: "filters and keywords config must be visible for users to edit"). Every built-in value of the
// two readers (lib/amazon.js, lib/tiktok.js in the money-hub service) is a setting shown here: which senders are read and
// what each is, the words that make a charge theirs, how far back a first read and the later ones go, the matching
// windows, how long a return counts as new. The built-in values stay as they are in code; what is saved here is the
// owner's, and Reset to built-in puts the built-in ones back.
import { useEffect, useMemo, useRef, useState } from "react";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Switch } from "@wealthfolio/ui/components/ui/switch";
import { Group, Row } from "./receipt-mail-card";

export type ReaderStore = "amazon" | "tiktok";

export interface ReaderSender {
  address: string;
  /** Amazon: what the sender's emails are. */
  kind?: string;
  /** TikTok: a word the subject must have (optional). */
  subject?: string;
  on: boolean;
}

export interface ReaderConfig {
  senders: ReaderSender[];
  chargeWords: string[];
  firstDays: number;
  recentDays: number;
  shipBefore?: number;
  shipAfter?: number;
  orderBefore: number;
  orderAfter: number;
  returnFreshDays: number;
}

/** What the gear needs from a reader's status. */
export interface ReaderStatus {
  busy: boolean;
  /** The settings in force, and the built-in ones. */
  config: ReaderConfig;
  defaults: ReaderConfig;
  /** The owner saved their own over the built-in ones. */
  custom: boolean;
}

type Run = <T>(
  what: string,
  fn: () => Promise<T>,
  take: (v: T) => void,
  ok?: string,
) => Promise<void>;

const SENDER_KINDS: [string, string][] = [
  ["order", "Order confirmations"],
  ["shipment", "Shipments"],
  ["update", "Delivered or cancelled"],
  ["return", "Returns and refunds"],
];

const btn =
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50";
const field =
  "h-8 rounded-md border bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none disabled:opacity-50";

type NumKey =
  | "firstDays"
  | "recentDays"
  | "shipBefore"
  | "shipAfter"
  | "orderBefore"
  | "orderAfter"
  | "returnFreshDays";

/** What the boxes hold: numbers and the word list as text, so a half-typed value is not rewritten under the cursor. */
interface Draft {
  senders: ReaderSender[];
  chargeWords: string;
  nums: Record<NumKey, string>;
}

const NUM_KEYS: NumKey[] = [
  "firstDays",
  "recentDays",
  "shipBefore",
  "shipAfter",
  "orderBefore",
  "orderAfter",
  "returnFreshDays",
];

const toDraft = (c: ReaderConfig): Draft => ({
  senders: c.senders.map((s) => ({ ...s })),
  chargeWords: c.chargeWords.join(", "),
  nums: Object.fromEntries(NUM_KEYS.map((k) => [k, c[k] == null ? "" : String(c[k])])) as Record<
    NumKey,
    string
  >,
});

/** The gear itself: opens and closes the panel. */
export function GearButton({
  open,
  onClick,
  label,
}: {
  open: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`${btn} h-8 px-2 ${open ? "!border-primary/50 !text-primary" : ""}`}
      aria-label={label}
      aria-expanded={open}
      title="Filters and keywords"
      onClick={onClick}
    >
      <Icons.Settings className="size-4" />
    </button>
  );
}

/** Every setting of Amazon orders or TikTok Shop orders, editable. Save sends them; Reset puts the built-in ones back. */
export function ReaderGearPanel({
  store,
  url,
  status,
  setStatus,
  busy,
  run,
}: {
  store: ReaderStore;
  url: string;
  status: ReaderStatus;
  setStatus: (s: never) => void;
  busy: string | null;
  run: Run;
}) {
  const name = store === "amazon" ? "Amazon" : "TikTok Shop";
  // Keyed by what is saved, so the status refreshing while a check runs never rewrites what is being typed.
  const savedKey = JSON.stringify(status.config);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const saved = useMemo(() => toDraft(status.config), [savedKey]);
  const [draft, setDraft] = useState<Draft>(saved);
  useEffect(() => setDraft(saved), [saved]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const isBuiltIn = JSON.stringify(saved) === JSON.stringify(toDraft(status.defaults));
  // A new or changed sender, or a first read that goes further back, needs mail that was never fetched.
  const rereads =
    JSON.stringify(draft.senders) !== JSON.stringify(saved.senders) ||
    Number(draft.nums.firstDays) > Number(saved.nums.firstDays);

  const put = (body: unknown) =>
    fetch(url, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(
          (data as { error?: string }).error || `The money app helper said ${res.status}`,
        );
      return data as ReaderStatus;
    });
  const take = setStatus as unknown as (s: ReaderStatus) => void;

  const save = () =>
    run(
      `${store}-config`,
      () =>
        put({
          config: {
            senders: draft.senders,
            chargeWords: draft.chargeWords,
            ...Object.fromEntries(NUM_KEYS.map((k) => [k, draft.nums[k]])),
          },
        }),
      take,
      rereads
        ? "Saved. Reading the mail again, it can take a few minutes."
        : "Saved. Checking with these settings now.",
    );
  const reset = () =>
    run(`${store}-reset`, () => put({ config: null }), take, "Back to the built-in settings.");

  const setSender = (i: number, patch: Partial<ReaderSender>) =>
    setDraft((d) => ({
      ...d,
      senders: d.senders.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    }));
  const num = (k: NumKey, w = "w-14") => (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      value={draft.nums[k]}
      onChange={(e) => setDraft((d) => ({ ...d, nums: { ...d.nums, [k]: e.target.value } }))}
      className={`${field} ${w}`}
      aria-label={`${name} ${k}`}
    />
  );
  const muted = (t: string) => <span className="text-muted-foreground">{t}</span>;

  return (
    <div className="space-y-2 border-t px-4 py-3 text-xs">
      <Group title="Emails read">
        <div className="divide-y">
          {draft.senders.map((s, i) => (
            <div
              key={i}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 py-1.5 sm:grid-cols-[2.25rem_minmax(0,1fr)_12rem_2rem] sm:gap-x-3"
            >
              <Switch
                checked={s.on}
                aria-label={`Read ${s.address || "this sender"}`}
                onCheckedChange={(on) => setSender(i, { on })}
              />
              <input
                value={s.address}
                onChange={(e) => setSender(i, { address: e.target.value })}
                placeholder="sender@store.com"
                className={`${field} w-full`}
                aria-label="Sender address"
              />
              <button
                type="button"
                className={`${btn} order-3 h-8 px-2 sm:order-4`}
                aria-label={`Remove ${s.address || "this sender"}`}
                onClick={() =>
                  setDraft((d) => ({ ...d, senders: d.senders.filter((_, j) => j !== i) }))
                }
              >
                <Icons.Close className="size-3.5" />
              </button>
              {store === "amazon" ? (
                <select
                  value={s.kind ?? "order"}
                  onChange={(e) => setSender(i, { kind: e.target.value })}
                  className={`${field} order-4 col-span-3 w-full sm:order-3 sm:col-span-1`}
                  aria-label={`What ${s.address || "this sender"} sends`}
                >
                  {SENDER_KINDS.map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={s.subject ?? ""}
                  onChange={(e) => setSender(i, { subject: e.target.value })}
                  placeholder="Subject has (optional)"
                  className={`${field} order-4 col-span-3 w-full sm:order-3 sm:col-span-1`}
                  aria-label={`Subject word for ${s.address || "this sender"}`}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 py-1.5">
          <span className="text-muted-foreground hidden text-[11px] sm:inline">
            {store === "amazon"
              ? "Each kind is read its own way: orders, shipments (the card is charged this total), delivered or cancelled, returns and refunds."
              : "Happy Returns writes about every store, so its address needs the subject word."}
          </span>
          <button
            type="button"
            className={`${btn} h-7`}
            onClick={() =>
              setDraft((d) => ({
                ...d,
                senders: [...d.senders, { address: "", kind: "order", subject: "", on: true }],
              }))
            }
          >
            <Icons.Plus className="size-3.5" /> Add a sender
          </button>
        </div>
      </Group>

      <Group title="Which charges">
        <Row
          label="Charge words"
          hint="A charge whose name has a word starting with one is theirs."
        >
          <textarea
            rows={2}
            value={draft.chargeWords}
            placeholder={store === "amazon" ? "amazon, amzn" : "tiktok"}
            onChange={(e) => setDraft((d) => ({ ...d, chargeWords: e.target.value }))}
            className={`${field} h-auto w-full resize-y py-1.5 leading-snug`}
            aria-label={`${name} charge words`}
          />
        </Row>
        {store === "amazon" ? (
          <Row label="Shipment's charge" hint="From before the email to after it.">
            <span className="inline-flex flex-wrap items-center gap-1.5">
              {num("shipBefore")} {muted("days before to")} {num("shipAfter")} {muted("after")}
            </span>
          </Row>
        ) : null}
        <Row
          label="Order's charge"
          hint={
            store === "amazon"
              ? "When no shipment matched (digital, gift cards)."
              : "From before the order was placed to after."
          }
        >
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {num("orderBefore")} {muted("days before to")} {num("orderAfter")} {muted("after")}
          </span>
        </Row>
      </Group>

      <Group title="How far back">
        <Row label="First read" hint="A Google account read for the first time.">
          <span className="inline-flex items-center gap-1.5">
            {num("firstDays", "w-20")} {muted("days")}
          </span>
        </Row>
        <Row label="Later reads" hint="Only recent mail; what was read is kept.">
          <span className="inline-flex items-center gap-1.5">
            {num("recentDays", "w-20")} {muted("days")}
          </span>
        </Row>
        <Row label="Return is new" hint="Older returns go to the Returns page as history.">
          <span className="inline-flex items-center gap-1.5">
            {num("returnFreshDays", "w-20")} {muted("days")}
          </span>
        </Row>
      </Group>

      <div className="flex flex-wrap items-center gap-2 border-t pt-2.5">
        <button
          type="button"
          className={`${btn} !border-primary/50 !text-primary h-8`}
          disabled={!!busy || !dirty}
          onClick={save}
        >
          {busy === `${store}-config` ? (
            <Icons.Spinner className="size-3.5 animate-spin" />
          ) : (
            <Icons.Check className="size-3.5" />
          )}{" "}
          Save
        </button>
        {dirty ? (
          <button
            type="button"
            className={`${btn} h-8`}
            disabled={!!busy}
            onClick={() => setDraft(saved)}
          >
            Undo changes
          </button>
        ) : null}
        {dirty && rereads ? (
          <span className="text-muted-foreground text-[11px]">
            Saving reads all the mail again.
          </span>
        ) : null}
        <span className="flex-1" />
        {isBuiltIn && !dirty ? (
          <span className="text-muted-foreground text-[11px]">Built-in settings</span>
        ) : (
          <button
            type="button"
            className={`${btn} h-8`}
            disabled={!!busy}
            onClick={reset}
            title="Puts the built-in settings back."
          >
            {busy === `${store}-reset` ? (
              <Icons.Spinner className="size-3.5 animate-spin" />
            ) : (
              <Icons.Undo className="size-3.5" />
            )}{" "}
            Reset to built-in
          </button>
        )}
      </div>
    </div>
  );
}

/** While a check runs (a changed sender list reads all the mail again), look again until it is done: one steady timer. */
export function useWhileBusy(busy: boolean, refresh: () => void) {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => latest.current(), 3000);
    return () => clearInterval(t);
  }, [busy]);
}
