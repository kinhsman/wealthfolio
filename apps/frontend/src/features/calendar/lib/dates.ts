// money-hub patch: important dates (owner, 2026-10-20: "track important birthdays, holidays, so i can plan buying
// gift ... just calendar, i open it and see everything related to that day"). People and their days (birthday,
// anniversary, giỗ), the US and Vietnam holidays, gift ideas and the gifts given are kept by the money-hub service
// (server/drive-backup/lib/dates.js, which also places lunar dates on their solar day each year); this file reads
// it and sends the owner's changes.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

export type DateKind = "birthday" | "anniversary" | "memorial" | "other";
export type Gender = "female" | "male" | "other";

export interface Idea {
  id: string;
  text: string;
  done: boolean;
  at: string;
}

export interface BankCharge {
  id: string;
  merchant: string;
  amount: number;
  date: string | null;
}

export interface Gift {
  id: string;
  personId: string | null;
  /** The occasion's key: "date:<dateId>:<year>" or "hol:<holidayId>:<year>". */
  occasion: string;
  title: string;
  what: string;
  amount: number | null;
  date: string;
  charge: BankCharge | null;
}

export interface Person {
  id: string;
  name: string;
  relation: string;
  /** "female", "male", "other", or "" when not said (the Assistant plans gifts with it). */
  gender: Gender | "";
  /** What they like: interests, sizes, favourite brands. */
  likes: string;
  budget: number | null;
  note: string;
  ideas: Idea[];
  /** The person's next day (YYYY-MM-DD), or null. */
  next: string | null;
  /** Gifts given, newest first. */
  given: Gift[];
}

export interface ImportantDate {
  id: string;
  personId: string | null;
  kind: DateKind;
  title: string;
  month: number;
  day: number;
  year: number | null;
  lunar: boolean;
  /** Its own heads-up in days; null = the app-wide one. */
  remind: number | null;
  gift: boolean;
}

export interface Holiday {
  id: string;
  set: "us" | "vn";
  name: string;
  en: string | null;
  /** How it falls: "Dec 25", "Lunar 15/8", "Fourth Thursday of November". */
  when: string;
  on: boolean;
  gift: boolean;
  budget: number | null;
}

export interface Occurrence {
  key: string;
  date: string;
  source: "date" | "holiday";
  kind: DateKind | "holiday";
  title: string;
  /** "turns 34", "5th anniversary", or a holiday's English name. */
  sub: string;
  personId: string | null;
  dateId: string | null;
  holidayId: string | null;
  set: "us" | "vn" | null;
  /** "Lunar 15/8" for a lunar date. */
  lunar: string | null;
  gift: boolean;
  budget: number | null;
  remind: number;
  remindOn: string;
  given: Gift[];
  /** What was given on the same day the year before. */
  lastTime: Gift[];
}

export interface DatesView {
  today: string;
  lunarToday: { day: number; month: number; year: number; leap: boolean };
  from: string;
  to: string;
  remindDays: number;
  people: Person[];
  dates: ImportantDate[];
  holidays: {
    sets: Record<"us" | "vn", boolean>;
    names: Record<"us" | "vn", string>;
    list: Holiday[];
  };
  occurrences: Occurrence[];
}

export interface DateInput {
  kind: DateKind;
  personId?: string | null;
  title?: string;
  month: number;
  day: number;
  year?: number | null;
  lunar: boolean;
  remind?: number | null;
  gift?: boolean;
}

export interface PersonInput {
  name: string;
  relation?: string;
  gender?: Gender | "";
  likes?: string;
  budget?: number | string | null;
  note?: string;
  dates?: DateInput[];
}

export interface GiftInput {
  occasion?: string;
  personId?: string | null;
  what?: string;
  amount?: number | string | null;
  date?: string;
  charge?: BankCharge | null;
}

export interface ChargeChoice extends BankCharge {
  accountId: string | null;
  currency?: string;
  notes: string;
  looksRight: boolean;
  used: boolean;
}

const BASE = "/api/money-hub/dates";
export const DATES_KEY = ["money-hub", "dates"] as const;

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

export const datesApi = {
  get: (range?: { from: string; to: string }) =>
    call<DatesView>("GET", range ? `?from=${range.from}&to=${range.to}` : ""),
  settings: (input: {
    remindDays?: number;
    sets?: Partial<Record<"us" | "vn", boolean>>;
    holiday?: { id: string; on?: boolean; gift?: boolean; budget?: number | string | null };
  }) => call<DatesView>("PUT", "/settings", input),
  addPerson: (p: PersonInput) => call<DatesView>("POST", "/people", p),
  updatePerson: (id: string, p: Partial<PersonInput>) =>
    call<DatesView>("PUT", `/people/${seg(id)}`, p),
  removePerson: (id: string) => call<DatesView>("DELETE", `/people/${seg(id)}`),
  addIdea: (personId: string, text: string) =>
    call<DatesView>("POST", `/people/${seg(personId)}/ideas`, { text }),
  updateIdea: (personId: string, ideaId: string, input: { done?: boolean; text?: string }) =>
    call<DatesView>("PUT", `/people/${seg(personId)}/ideas/${seg(ideaId)}`, input),
  removeIdea: (personId: string, ideaId: string) =>
    call<DatesView>("DELETE", `/people/${seg(personId)}/ideas/${seg(ideaId)}`),
  addDate: (d: DateInput) => call<DatesView>("POST", "/dates", d),
  updateDate: (id: string, d: Partial<DateInput>) => call<DatesView>("PUT", `/dates/${seg(id)}`, d),
  removeDate: (id: string) => call<DatesView>("DELETE", `/dates/${seg(id)}`),
  addGift: (g: GiftInput) => call<DatesView>("POST", "/gifts", g),
  updateGift: (id: string, g: GiftInput) => call<DatesView>("PUT", `/gifts/${seg(id)}`, g),
  removeGift: (id: string) => call<DatesView>("DELETE", `/gifts/${seg(id)}`),
  /** Money out that can be named as what paid a gift: the last 30 days, or a year when searched by a word. */
  charges: (q = "") => call<ChargeChoice[]>("GET", `/charges${q ? `?q=${seg(q)}` : ""}`),
};

/** The default window (about 6 weeks back to 13 months ahead): People, Coming up, and the months it covers. */
export function useDates() {
  return useQuery({ queryKey: DATES_KEY, queryFn: () => datesApi.get(), staleTime: 60 * 1000 });
}

/** A month the default window does not reach (the arrows walked far back or ahead). */
export function useDatesRange(range: { from: string; to: string } | null) {
  return useQuery({
    queryKey: [...DATES_KEY, range?.from, range?.to],
    queryFn: () => datesApi.get(range ?? undefined),
    enabled: !!range,
    staleTime: 60 * 1000,
  });
}

/** One change at a time: the fresh view where the page reads it (other windows read again), a toast either way. */
export function useDatesAct() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (what: string, fn: () => Promise<DatesView>, done?: string) => {
    setBusy(what);
    try {
      qc.setQueryData(DATES_KEY, await fn());
      void qc.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === DATES_KEY[0] && q.queryKey[1] === DATES_KEY[1] && q.queryKey.length > 2,
      });
      if (done) toast.success(done);
      return true;
    } catch (e) {
      toast.error((e as Error)?.message ?? String(e));
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

// --------------------------------------------------------------- words --

export const KIND_WORDS: Record<DateKind, string> = {
  birthday: "Birthday",
  anniversary: "Anniversary",
  memorial: "Giỗ (memorial)",
  other: "Other",
};

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** How a date is written: "Nov 3" or "Lunar 15/8". */
export function dateWhen(d: Pick<ImportantDate, "month" | "day" | "lunar">): string {
  return d.lunar ? `Lunar ${d.day}/${d.month}` : `${MONTHS[d.month - 1].slice(0, 3)} ${d.day}`;
}
