import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QueryKeys } from "@/lib/query-keys";

import {
  canTrackInSpending,
  setAccountTracked,
  trackingToApply,
  withTrackedAccount,
} from "./tracked-accounts";

const api = vi.hoisted(() => ({
  getSpendingSettings: vi.fn(),
  updateSpendingSettings: vi.fn(),
}));
vi.mock("../adapters/settings", () => api);

const rental = JSON.stringify({ displayType: "RENTAL" });

describe("canTrackInSpending", () => {
  it("Cash and Credit card yes; Securities, Crypto and a rental ledger no", () => {
    expect(canTrackInSpending("CASH")).toBe(true);
    expect(canTrackInSpending("CREDIT_CARD", null)).toBe(true);
    expect(canTrackInSpending("SECURITIES")).toBe(false);
    expect(canTrackInSpending("CRYPTOCURRENCY")).toBe(false);
    expect(canTrackInSpending("CASH", rental)).toBe(false);
    expect(canTrackInSpending(undefined)).toBe(false);
  });
});

describe("withTrackedAccount", () => {
  it("adds once at the end, removes only that account, never reorders the rest", () => {
    expect(withTrackedAccount(["a", "b"], "c", true)).toEqual(["a", "b", "c"]);
    expect(withTrackedAccount(["a", "b"], "a", true)).toEqual(["a", "b"]);
    expect(withTrackedAccount(["a", "b", "c"], "b", false)).toEqual(["a", "c"]);
    expect(withTrackedAccount(["a"], "z", false)).toEqual(["a"]);
  });
});

describe("trackingToApply", () => {
  it("a new Cash or Credit card account is tracked unless the owner turned it off", () => {
    expect(trackingToApply({ accountType: "CASH", isNew: true, choice: null })).toBe(true);
    expect(trackingToApply({ accountType: "CREDIT_CARD", isNew: true, choice: null })).toBe(true);
    expect(trackingToApply({ accountType: "CASH", isNew: true, choice: false })).toBe(false);
  });

  it("an existing account changes only when the owner touched the switch", () => {
    expect(trackingToApply({ accountType: "CASH", isNew: false, choice: null })).toBeNull();
    expect(trackingToApply({ accountType: "CASH", isNew: false, choice: true })).toBe(true);
    expect(trackingToApply({ accountType: "CASH", isNew: false, choice: false })).toBe(false);
  });

  it("never for a type or a rental Spending cannot track", () => {
    expect(trackingToApply({ accountType: "SECURITIES", isNew: true, choice: null })).toBeNull();
    expect(
      trackingToApply({ accountType: "CASH", meta: rental, isNew: true, choice: true }),
    ).toBeNull();
  });
});

describe("setAccountTracked", () => {
  const saved = { enabled: true, accountIds: ["a", "b"], excludedCategoryIds: [] };
  let qc: QueryClient;

  beforeEach(() => {
    qc = new QueryClient();
    api.getSpendingSettings.mockReset().mockResolvedValue(saved);
    api.updateSpendingSettings
      .mockReset()
      .mockImplementation((u: { accountIds: string[] }) => Promise.resolve({ ...saved, ...u }));
  });

  it("adds the account to the saved list and puts the result in the cache", async () => {
    await setAccountTracked(qc, "wallet", true);
    expect(api.updateSpendingSettings).toHaveBeenCalledWith({ accountIds: ["a", "b", "wallet"] });
    expect(qc.getQueryData<{ accountIds: string[] }>([QueryKeys.SPENDING_SETTINGS])?.accountIds).toEqual([
      "a",
      "b",
      "wallet",
    ]);
  });

  it("writes nothing when the account is already as wanted", async () => {
    await setAccountTracked(qc, "a", true);
    await setAccountTracked(qc, "wallet", false);
    expect(api.updateSpendingSettings).not.toHaveBeenCalled();
  });

  it("reads the saved list fresh, so a stale cache cannot overwrite another change", async () => {
    qc.setQueryData([QueryKeys.SPENDING_SETTINGS], { ...saved, accountIds: ["old"] });
    await setAccountTracked(qc, "wallet", true);
    expect(api.updateSpendingSettings).toHaveBeenCalledWith({ accountIds: ["a", "b", "wallet"] });
  });

  it("can switch an account off", async () => {
    await setAccountTracked(qc, "b", false);
    expect(api.updateSpendingSettings).toHaveBeenCalledWith({ accountIds: ["a"] });
  });
});
