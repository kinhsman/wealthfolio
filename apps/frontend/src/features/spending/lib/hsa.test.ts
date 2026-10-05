import { describe, expect, it } from "vitest";

import {
  NO_FILTERS,
  NO_PATIENT,
  agoText,
  amountText,
  dayText,
  dollarsRecalculated,
  draftError,
  draftOf,
  errorBanner,
  exportUrl,
  filterHsa,
  formatUsd,
  hsaSearchIndex,
  isFiltered,
  junkCount,
  mirrorLine,
  needsPhoto,
  noUsdText,
  outcomeBanner,
  parsePatients,
  patchOf,
  patientsText,
  pictured,
  pollAfterCopy,
  reimbursedPatch,
  scopeRows,
  searchHsa,
  sourceTone,
  statusTone,
  todayIso,
  totalsOfRows,
  usdNote,
  type HsaMirror,
  type HsaReceipt,
} from "./hsa";

const make = (over: Partial<HsaReceipt>): HsaReceipt => ({
  id: "a1",
  at: "2026-09-20T10:00:00Z",
  source: "photo",
  date: "2026-09-19",
  provider: "Ocean Clinic",
  patient: "Mira Stone",
  type: "Medical",
  description: "Lab tests",
  amount: 45,
  currency: "USD",
  rate: 1,
  usd: 45,
  amountSource: "receipt",
  status: "unreimbursed",
  reimbursedOn: null,
  notes: "Added from a photo.",
  dupeGroup: "",
  photos: 1,
  oldLink: null,
  chargeId: null,
  chargeDate: null,
  confidence: 0.9,
  inDrive: false,
  ...over,
});

const rows: HsaReceipt[] = [
  make({
    id: "1",
    date: "2026-09-19",
    provider: "Ocean Clinic",
    usd: 45.1,
    amount: 45.1,
    inDrive: true,
  }),
  make({
    id: "2",
    date: "2026-08-02",
    provider: "Harbor Pharmacy",
    description: "Prescription",
    type: "Rx",
    patient: "Jon Reed",
    amount: 12.5,
    usd: 12.5,
    amountSource: "card",
    status: "reimbursed",
    reimbursedOn: "2026-08-20",
  }),
  make({
    id: "3",
    date: "2026-07-11",
    provider: "Phòng khám Minh",
    patient: null,
    amount: 1250000,
    currency: "VND",
    rate: 25000,
    usd: 50,
    amountSource: "estimate",
    description: "Check-up",
  }),
  make({
    id: "4",
    date: "2025-12-30",
    provider: "Clear Eyes",
    type: "Vision",
    amount: 80,
    usd: 80.2,
    status: "review",
    photos: 0,
    oldLink: null,
  }),
  make({
    id: "5",
    date: "2025-05-05",
    provider: "Smile Dental",
    type: "Dental",
    patient: "Jon Reed",
    amount: 200,
    usd: null,
    amountSource: "unverified",
    photos: 0,
    oldLink: "https://drive.example/x",
  }),
  make({ id: "6", date: "2026-01-01", provider: "Test Row", status: "junk" }),
];

describe("labels and tones", () => {
  it("colours the amount source: card green, estimate amber, unverified red, receipt neutral", () => {
    expect(sourceTone("card")).toBe("good");
    expect(sourceTone("estimate")).toBe("look");
    expect(sourceTone("unverified")).toBe("bad");
    expect(sourceTone("receipt")).toBe("plain");
  });
  it("colours the status", () => {
    expect(statusTone("reimbursed")).toBe("good");
    expect(statusTone("review")).toBe("look");
    expect(statusTone("junk")).toBe("muted");
    expect(statusTone("unreimbursed")).toBe("info");
  });
});

describe("money and days", () => {
  it("writes dollars and a foreign amount with its code", () => {
    expect(formatUsd(1234.5)).toBe("$1,234.50");
    expect(amountText({ amount: 45, currency: "USD" })).toBe("$45.00");
    expect(amountText({ amount: 1250000, currency: "VND" })).toBe("1,250,000 VND");
  });
  it("gives the dollars only for a receipt not in dollars", () => {
    expect(usdNote({ currency: "USD", usd: 45 })).toBeNull();
    expect(usdNote({ currency: "VND", usd: 50 })).toBe("$50.00");
    expect(usdNote({ currency: "VND", usd: null })).toBeNull();
  });
  it("writes a day with no time zone shift, and today by the local calendar", () => {
    expect(dayText("2026-09-19")).toBe("Sep 19, 2026");
    expect(todayIso(new Date(2026, 9, 4, 23, 59))).toBe("2026-10-04");
  });
  it("shapes a receipt for the shared picture panel", () => {
    expect(pictured(rows[2])).toMatchObject({
      id: "3",
      store: "Phòng khám Minh",
      date: "2026-07-11",
      total: 50,
      photos: 1,
    });
  });
  it("knows a receipt that needs a photo (no picture and no old link)", () => {
    expect(needsPhoto(rows[3])).toBe(true);
    expect(needsPhoto(rows[4])).toBe(false);
    expect(needsPhoto(rows[0])).toBe(false);
  });
});

describe("totals", () => {
  it("sums each status in whole cents and counts the ones with no dollar amount", () => {
    const t = totalsOfRows(rows);
    expect(t.unreimbursed).toEqual({ n: 3, usd: 95.1, noUsd: 1 });
    expect(t.review).toEqual({ n: 1, usd: 80.2, noUsd: 0 });
    expect(t.reimbursed).toEqual({ n: 1, usd: 12.5, noUsd: 0 });
    expect(t.needsPhoto).toBe(1);
  });
  it("leaves junk out and narrows to a year and a person", () => {
    expect(scopeRows(rows, { year: null, patient: null })).toHaveLength(5);
    expect(scopeRows(rows, { year: "2026", patient: null }).map((r) => r.id)).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(scopeRows(rows, { year: null, patient: "Jon Reed" }).map((r) => r.id)).toEqual([
      "2",
      "5",
    ]);
    expect(scopeRows(rows, { year: null, patient: NO_PATIENT }).map((r) => r.id)).toEqual(["3"]);
    expect(
      totalsOfRows(scopeRows(rows, { year: "2025", patient: "Jon Reed" })).unreimbursed,
    ).toEqual({ n: 1, usd: 0, noUsd: 1 });
  });
  it("says what has no dollar amount yet, in words and in keywords", () => {
    expect(noUsdText({ noUsd: 0 })).toBeNull();
    expect(noUsdText({ noUsd: 1 })).toBe("1 has no dollar amount yet");
    expect(noUsdText({ noUsd: 3 })).toBe("3 have no dollar amount yet");
    expect(noUsdText({ noUsd: 3 }, true)).toBe("3 with no $");
  });
});

describe("filters", () => {
  const ids = (f: Partial<typeof NO_FILTERS>) =>
    filterHsa(rows, { ...NO_FILTERS, ...f }).map((r) => r.id);
  it("hides junk unless the status filter is Junk", () => {
    expect(ids({})).toEqual(["1", "2", "3", "4", "5"]);
    expect(ids({ status: "junk" })).toEqual(["6"]);
    expect(junkCount(rows)).toBe(1);
  });
  it("filters by status, year, person (and no person), and needs photo", () => {
    expect(ids({ status: "unreimbursed" })).toEqual(["1", "3", "5"]);
    expect(ids({ status: "review" })).toEqual(["4"]);
    expect(ids({ year: "2025" })).toEqual(["4", "5"]);
    expect(ids({ patient: "Jon Reed" })).toEqual(["2", "5"]);
    expect(ids({ patient: NO_PATIENT })).toEqual(["3"]);
    expect(ids({ needsPhoto: true })).toEqual(["4"]);
    expect(ids({ year: "2025", patient: "Jon Reed", status: "unreimbursed" })).toEqual(["5"]);
  });
  it("knows when any filter is on", () => {
    expect(isFiltered(NO_FILTERS)).toBe(false);
    expect(isFiltered({ ...NO_FILTERS, patient: NO_PATIENT })).toBe(true);
    expect(isFiltered({ ...NO_FILTERS, needsPhoto: true })).toBe(true);
  });
});

describe("search", () => {
  const index = hsaSearchIndex(rows);
  const find = (q: string) => searchHsa(index, q).map((r) => r.id);
  it("finds any field the row shows, any order, accents ignored", () => {
    expect(find("")).toHaveLength(6);
    expect(find("ocean")).toEqual(["1"]);
    expect(find("lab tests ocean")).toEqual(["1"]);
    expect(find("phong")).toEqual(["3"]);
    expect(find("rx")).toEqual(["2"]);
    expect(find("jon")).toEqual(["2", "5"]);
    expect(find("vnd")).toEqual(["3"]);
    expect(find("check-up")).toEqual(["3"]);
  });
  it("finds a date as it can be typed and an amount with or without the dollar sign", () => {
    expect(find("2026-09-19")).toEqual(["1"]);
    expect(find("sep 19")).toEqual(["1"]);
    expect(find("9/19/2026")).toEqual(["1"]);
    expect(find("$45.10")).toEqual(["1"]);
    expect(find("45.10")).toEqual(["1"]);
    expect(find("1,250,000")).toEqual(["3"]);
    expect(find("$50.00")).toEqual(["3"]);
  });
  it("finds the words the row shows: the source tag, the status, no photo, in drive, no patient", () => {
    expect(find("converted estimate")).toEqual(["3"]);
    expect(find("card charge")).toEqual(["2"]);
    expect(find("needs review")).toEqual(["4"]);
    expect(find("no photo")).toEqual(["4"]);
    expect(find("in drive")).toEqual(["1"]);
    expect(find("no patient")).toEqual(["3"]);
  });
  it("matches the start of a word: reimbursed does not find the Unreimbursed rows", () => {
    expect(find("reimbursed")).toEqual(["2"]);
    expect(find("unreimbursed")).toEqual(["1", "3", "5"]);
  });
  it("does not search words the row never shows (the notes, the id, the old link)", () => {
    expect(find("photo")).toEqual(["4"]);
    expect(find("added")).toEqual([]);
    expect(find("drive.example")).toEqual([]);
  });
});

describe("the banner after an add (the old bot's words)", () => {
  const words = (b: { title: string; text?: string }) =>
    [b.title, b.text].filter(Boolean).join(" ");
  it("saved: provider, date, amount", () => {
    const b = outcomeBanner({ outcome: "saved", receipt: rows[0] });
    expect(b.tone).toBe("good");
    expect(b.title).toBe("Receipt saved");
    expect(b.text).toBe("Ocean Clinic · Sep 19, 2026 · $45.10");
    expect(b.receiptId).toBe("1");
  });
  it("saved in another currency adds about what in dollars", () => {
    expect(outcomeBanner({ outcome: "saved", receipt: rows[2] }).text).toBe(
      "Phòng khám Minh · Jul 11, 2026 · 1,250,000 VND · about $50.00",
    );
  });
  it("duplicate: already filed, with the matched titles", () => {
    const b = outcomeBanner({
      outcome: "duplicate",
      receipt: rows[0],
      matches: [
        { id: "1", title: "2026-09-19 Ocean Clinic $45.1", how: "same USD", hasPhoto: true },
      ],
    });
    expect(words(b)).toBe("Already filed. This receipt is already in your records.");
    expect(b.lines).toEqual(["2026-09-19 Ocean Clinic $45.1"]);
    expect(b.tone).toBe("plain");
  });
  it("attached, unreadable, not a receipt, need detail", () => {
    expect(words(outcomeBanner({ outcome: "attached", receipt: rows[0] }))).toBe(
      "Photo attached to an existing entry. No new row was made.",
    );
    expect(words(outcomeBanner({ outcome: "unreadable", receipt: null }))).toBe(
      "Couldn't read that clearly. The photo looks blurry or too small. Please send a sharper, larger photo of the full receipt.",
    );
    expect(words(outcomeBanner({ outcome: "not_receipt", receipt: null }))).toBe(
      "That doesn't look like a receipt. Send a clear photo, or type: provider, amount, currency, date.",
    );
    expect(words(outcomeBanner({ outcome: "need_detail", receipt: null }))).toBe(
      "Need a bit more. Include provider, amount, currency and date.",
    );
    expect(outcomeBanner({ outcome: "unreadable", receipt: null }).tone).toBe("look");
  });
  it("shows a request error as it came", () => {
    expect(errorBanner("A photo is over 20 MB. Choose a smaller one.")).toEqual({
      tone: "look",
      title: "A photo is over 20 MB. Choose a smaller one.",
    });
  });
  it("uses no em-dash anywhere in its words", () => {
    for (const outcome of [
      "saved",
      "duplicate",
      "attached",
      "unreadable",
      "not_receipt",
      "need_detail",
    ] as const) {
      expect(JSON.stringify(outcomeBanner({ outcome, receipt: rows[0] }))).not.toContain("\u2014");
    }
  });
});

describe("the Drive copy line", () => {
  const base: HsaMirror = {
    on: true,
    link: "ok",
    folder: "HSA Receipts",
    waiting: 0,
    paused: null,
    error: null,
    lastAt: null,
    sheetUrl: null,
    folderUrl: null,
    sheetAt: null,
  };
  const now = Date.parse("2026-10-04T12:00:00Z");
  it("off, unlinked, paused", () => {
    expect(mirrorLine({ ...base, on: false }, { now }).text).toBe("Drive copy is off");
    expect(mirrorLine({ ...base, link: "unlinked" }, { now })).toMatchObject({
      text: "Link Google Drive on Settings, Backups to copy receipts to Drive",
      to: "/settings/exports",
      canRun: false,
    });
    expect(mirrorLine({ ...base, link: "unlinked" }, { now, short: true }).text).toBe(
      "Link Google Drive on Settings, Backups",
    );
    expect(mirrorLine({ ...base, link: "relink" }, { now }).text).toBe(
      "Drive copy paused: link Google again",
    );
    expect(mirrorLine({ ...base, paused: "relink" }, { now })).toMatchObject({
      text: "Drive copy paused: link Google again",
      tone: "look",
    });
  });
  it("copied: the folder, the waiting count, and Copy now", () => {
    expect(mirrorLine(base, { now })).toEqual({
      text: "Copied to Drive folder HSA Receipts",
      tone: "good",
      canRun: true,
    });
    expect(mirrorLine({ ...base, waiting: 3 }, { now }).text).toBe(
      "Copied to Drive folder HSA Receipts. 3 waiting",
    );
  });
  it("copied with a sheet: says when it was updated", () => {
    const m = {
      ...base,
      sheetUrl: "https://docs.google.com/spreadsheets/d/x/edit",
      sheetAt: "2026-10-04T11:55:00Z",
    };
    expect(mirrorLine(m, { now }).text).toBe(
      "Copied to Drive. Sheet and pictures updated 5 min ago",
    );
    expect(mirrorLine({ ...m, waiting: 2 }, { now }).text).toBe(
      "Copied to Drive. Sheet and pictures updated 5 min ago. 2 waiting",
    );
    expect(mirrorLine(m, { now, short: true }).text).toBe("Copied 5 min ago");
    expect(mirrorLine({ ...m, waiting: 2 }, { now, short: true }).text).toBe(
      "Copied 5 min ago, 2 waiting",
    );
    expect(mirrorLine(base, { now, short: true }).text).toBe("Copied to Drive");
  });
  it("nothing copied yet, and a problem", () => {
    expect(mirrorLine({ ...base, folder: null }, { now }).text).toBe("Drive copy is on");
    expect(mirrorLine({ ...base, error: "x" }, { now })).toMatchObject({
      tone: "look",
      canRun: true,
    });
  });
  it("uses no em-dash", () => {
    for (const m of [
      base,
      { ...base, link: "unlinked" as const },
      { ...base, paused: "relink" },
      { ...base, sheetUrl: "u", sheetAt: "2026-10-04T11:00:00Z" },
    ]) {
      expect(mirrorLine(m, { now }).text).not.toContain("\u2014");
    }
  });
  it("words a time", () => {
    expect(agoText("2026-10-04T11:59:40Z", now)).toBe("just now");
    expect(agoText("2026-10-04T09:00:00Z", now)).toBe("3 h ago");
    expect(agoText("2026-10-01T09:00:00Z", now)).toBe("Oct 1");
    expect(agoText(null, now)).toBeNull();
  });
  it("polls every few seconds while pictures wait, a minute at most", () => {
    expect(pollAfterCopy({ startedAt: null, now: 1000, waiting: 5 })).toBe(false);
    expect(pollAfterCopy({ startedAt: 0, now: 5000, waiting: 5 })).toBe(4000);
    expect(pollAfterCopy({ startedAt: 0, now: 59_000, waiting: 5 })).toBe(4000);
    expect(pollAfterCopy({ startedAt: 0, now: 60_000, waiting: 5 })).toBe(false);
    // nothing waiting: only the first moments (the sheet is written last)
    expect(pollAfterCopy({ startedAt: 0, now: 5000, waiting: 0 })).toBe(4000);
    expect(pollAfterCopy({ startedAt: 0, now: 20_000, waiting: 0 })).toBe(false);
  });
});

describe("export links", () => {
  it("everything: no query", () => {
    expect(exportUrl("zip", { year: null, patient: null, status: null })).toBe(
      "/api/money-hub/hsa/export.zip",
    );
    expect(exportUrl("csv", { year: null, patient: null, status: null })).toBe(
      "/api/money-hub/hsa/export.csv",
    );
  });
  it("a year, a person and a status", () => {
    expect(exportUrl("zip", { year: "2025", patient: "Mira Stone", status: "unreimbursed" })).toBe(
      "/api/money-hub/hsa/export.zip?year=2025&patient=Mira+Stone&status=unreimbursed",
    );
  });
  it("no patient is a dash", () => {
    expect(exportUrl("csv", { year: null, patient: NO_PATIENT, status: "reimbursed" })).toBe(
      "/api/money-hub/hsa/export.csv?patient=-&status=reimbursed",
    );
  });
});

describe("saving only what changed", () => {
  const r = rows[2]; // 1,250,000 VND, $50 estimate
  it("sends nothing when nothing changed", () => {
    expect(patchOf(r, draftOf(r))).toEqual({});
  });
  it("sends only the boxes that changed, trimmed", () => {
    const d = {
      ...draftOf(r),
      provider: "  Minh Clinic ",
      notes: "paid cash",
      patient: "Mira Stone",
    };
    expect(patchOf(r, d)).toEqual({
      provider: "Minh Clinic",
      notes: "paid cash",
      patient: "Mira Stone",
    });
  });
  it("a new amount or currency alone leaves the dollars to the server", () => {
    const d = { ...draftOf(r), amount: "1300000", currency: "vnd" };
    expect(patchOf(r, d)).toEqual({ amount: 1300000 });
    expect(dollarsRecalculated(r, d)).toBe(true);
    expect(patchOf(r, { ...draftOf(r), currency: "eur" })).toEqual({ currency: "EUR" });
  });
  it("a dollar figure typed by hand goes with where it is from", () => {
    const d = { ...draftOf(r), usd: "52.40", amountSource: "unverified" as const };
    expect(patchOf(r, d)).toEqual({ usd: 52.4, amountSource: "unverified" });
    expect(dollarsRecalculated(r, d)).toBe(false);
    expect(patchOf(r, { ...draftOf(r), usd: "" })).toMatchObject({ usd: null });
  });
  it("only the source changed", () => {
    expect(patchOf(r, { ...draftOf(r), amountSource: "receipt" })).toEqual({
      amountSource: "receipt",
    });
  });
  it("status and the reimbursed day", () => {
    expect(patchOf(r, { ...draftOf(r), status: "junk" })).toEqual({ status: "junk" });
    expect(patchOf(rows[1], { ...draftOf(rows[1]), reimbursedOn: "" })).toEqual({
      reimbursedOn: null,
    });
    expect(reimbursedPatch("2026-10-04")).toEqual({
      status: "reimbursed",
      reimbursedOn: "2026-10-04",
    });
  });
  it("clearing the patient sends an empty one", () => {
    expect(patchOf(rows[0], { ...draftOf(rows[0]), patient: "" })).toEqual({ patient: "" });
  });
  it("refuses the boxes the server would refuse, in its words", () => {
    const ok = draftOf(r);
    expect(draftError(ok)).toBeNull();
    expect(draftError({ ...ok, provider: " " })).toBe("Name the provider.");
    expect(draftError({ ...ok, date: "10/04/2026" })).toBe("The date must look like 2026-10-04.");
    expect(draftError({ ...ok, amount: "0" })).toBe("The amount must be more than zero.");
    expect(draftError({ ...ok, amount: "" })).toBe("The amount must be more than zero.");
    expect(draftError({ ...ok, currency: "DONG" })).toBe(
      "The currency is a 3-letter code like USD or VND.",
    );
    expect(draftError({ ...ok, usd: "-3" })).toBe("The dollar amount must be more than zero.");
    expect(draftError({ ...ok, usd: "" })).toBeNull();
  });
});

describe("the patients list", () => {
  it("is one name per line, trimmed, no repeats, 20 at most", () => {
    expect(parsePatients("  Mira Stone \n\njon reed\nMira  Stone\nJon Reed, Ana Cole")).toEqual([
      "Mira Stone",
      "jon reed",
      "Ana Cole",
    ]);
    expect(parsePatients(Array.from({ length: 30 }, (_, i) => `P${i}`).join("\n"))).toHaveLength(
      20,
    );
    expect(patientsText(["A", "B"])).toBe("A\nB");
  });
});
