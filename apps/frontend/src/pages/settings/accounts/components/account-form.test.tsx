import { fireEvent, render, screen, waitFor } from "@/test/render";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@wealthfolio/ui/components/ui/dialog";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AccountForm } from "./account-form";

const api = vi.hoisted(() => ({
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
  deleteAccount: vi.fn(),
  getSpendingSettings: vi.fn(),
  updateSpendingSettings: vi.fn(),
}));

vi.mock("@/adapters", () => ({
  createAccount: api.createAccount,
  updateAccount: api.updateAccount,
  deleteAccount: api.deleteAccount,
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/features/spending/adapters/settings", () => ({
  getSpendingSettings: api.getSpendingSettings,
  updateSpendingSettings: api.updateSpendingSettings,
}));
vi.mock("@/hooks/use-platform", () => ({ useIsMobileViewport: () => false }));
vi.mock("@/hooks/use-taxonomies", () => {
  const result = { data: null };
  return { useTaxonomy: () => result };
});

// jsdom has no ResizeObserver, which the switch needs.
if (typeof ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {
      return undefined;
    }
    unobserve() {
      return undefined;
    }
    disconnect() {
      return undefined;
    }
  } as typeof ResizeObserver;
}
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => undefined;
}

const EXISTING_ID = "11111111-1111-4111-8111-111111111111";
const saved = { enabled: true, accountIds: ["bank"], excludedCategoryIds: [] };

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <Dialog open>
        <DialogContent>{children}</DialogContent>
      </Dialog>
    </QueryClientProvider>
  );
}

const newAccount = (accountType: "CASH" | "SECURITIES" | "CREDIT_CARD", extra = {}) => ({
  name: "Cash Wallet",
  accountType,
  currency: "USD",
  isDefault: false,
  isActive: true,
  isArchived: false,
  trackingMode: "TRANSACTIONS" as const,
  ...extra,
});

describe("AccountForm: Track in Spending", () => {
  beforeEach(() => {
    api.getSpendingSettings.mockReset().mockResolvedValue(saved);
    api.updateSpendingSettings
      .mockReset()
      .mockImplementation((u: { accountIds: string[] }) => Promise.resolve({ ...saved, ...u }));
    api.createAccount
      .mockReset()
      .mockImplementation((a: object) => Promise.resolve({ ...a, id: "new-wallet-id" }));
    api.updateAccount.mockReset().mockImplementation((a: object) => Promise.resolve(a));
  });

  it("a new Cash account is tracked by default, so it shows up in Add transaction", async () => {
    render(<AccountForm defaultValues={newAccount("CASH")} />, { wrapper });

    expect(screen.getByRole("switch", { name: /track in spending/i })).toBeChecked();
    fireEvent.click(screen.getByTestId("account-submit-button"));

    await waitFor(() =>
      expect(api.updateSpendingSettings).toHaveBeenCalledWith({
        accountIds: ["bank", "new-wallet-id"],
      }),
    );
    expect(api.createAccount).toHaveBeenCalledTimes(1);
  });

  it("a new account stays out of Spending when the owner turns the switch off", async () => {
    render(<AccountForm defaultValues={newAccount("CASH")} />, { wrapper });

    fireEvent.click(screen.getByRole("switch", { name: /track in spending/i }));
    fireEvent.click(screen.getByTestId("account-submit-button"));

    await waitFor(() => expect(api.createAccount).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(api.updateSpendingSettings).not.toHaveBeenCalled();
  });

  it("a Credit card is tracked by default too", () => {
    render(<AccountForm defaultValues={newAccount("CREDIT_CARD", { name: "Visa" })} />, {
      wrapper,
    });
    expect(screen.getByRole("switch", { name: /track in spending/i })).toBeChecked();
  });

  it("an existing untracked account shows the switch off and an untouched save changes nothing", async () => {
    render(<AccountForm defaultValues={newAccount("CASH", { id: EXISTING_ID })} />, { wrapper });

    await waitFor(() =>
      expect(screen.getByRole("switch", { name: /track in spending/i })).not.toBeDisabled(),
    );
    expect(screen.getByRole("switch", { name: /track in spending/i })).not.toBeChecked();

    fireEvent.click(screen.getByTestId("account-submit-button"));
    await waitFor(() => expect(api.updateAccount).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(api.updateSpendingSettings).not.toHaveBeenCalled();
  });

  it("an existing account can be switched on from its own form", async () => {
    render(<AccountForm defaultValues={newAccount("CASH", { id: EXISTING_ID })} />, { wrapper });

    await waitFor(() =>
      expect(screen.getByRole("switch", { name: /track in spending/i })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole("switch", { name: /track in spending/i }));
    fireEvent.click(screen.getByTestId("account-submit-button"));

    await waitFor(() =>
      expect(api.updateSpendingSettings).toHaveBeenCalledWith({
        accountIds: ["bank", EXISTING_ID],
      }),
    );
  });

  it("an investment account has no such switch", () => {
    render(<AccountForm defaultValues={newAccount("SECURITIES", { name: "Brokerage" })} />, {
      wrapper,
    });
    expect(screen.queryByRole("switch", { name: /track in spending/i })).toBeNull();
  });
});
