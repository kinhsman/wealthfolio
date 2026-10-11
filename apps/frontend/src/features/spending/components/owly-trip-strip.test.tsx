import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Charge, OwlyTrip, OwlyTripBillsState } from "../lib/owly-trips";
import { OwlyTripStrip } from "./owly-trip-strip";

const trip = {
  id: 6,
  name: "Dallas - Worlds 2026",
  emoji: null,
  startsOn: null,
  endsOn: null,
  status: "active",
  currency: "USD",
  mixedCurrency: false,
  members: [
    { id: 1, name: "Sang", isOwner: true },
    { id: 2, name: "Thanh", isOwner: false },
  ],
  billCount: 1,
  bills: [
    {
      id: 83,
      description: "Hotel",
      billedOn: "2026-09-19",
      total: 160.2,
      currency: "USD",
      paidBy: "Sang",
      paidByYou: true,
    },
  ],
  totalSpent: 160.2,
  you: { paid: 160.2, share: 80.1 },
  owedToYou: 80.1,
  youOwe: 0,
  transfers: [],
} as OwlyTrip;

const charges: Charge[] = [
  { id: "a1", label: "HILTON PLANO", date: "2026-09-19", amount: 121.86, currency: "USD" },
];
const state = (over: Partial<OwlyTripBillsState> = {}): OwlyTripBillsState => ({
  on: true,
  lastRun: "T",
  lastError: null,
  added: 0,
  skipped: [],
  ...over,
});

const open = () => fireEvent.click(screen.getByTestId("owly-trip-lineup").querySelector("button")!);

describe("OwlyTripStrip adding charges to Owly", () => {
  it("says which charge goes to Owly and lets the owner leave it out", () => {
    const onSkip = vi.fn();
    render(<OwlyTripStrip trip={trip} charges={charges} billsState={state()} onSkip={onSkip} />);
    open();
    expect(screen.getByText(/Goes to Owly:/)).toHaveTextContent("HILTON PLANO");
    fireEvent.click(screen.getByRole("button", { name: "Leave out" }));
    expect(onSkip).toHaveBeenCalledWith("a1", true);
  });

  it("shows a charge that was left out, and adds it back", () => {
    const onSkip = vi.fn();
    render(
      <OwlyTripStrip
        trip={trip}
        charges={charges}
        billsState={state({ skipped: ["a1"] })}
        onSkip={onSkip}
      />,
    );
    open();
    expect(screen.getByText(/Left out of Owly:/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add back" }));
    expect(onSkip).toHaveBeenCalledWith("a1", false);
  });

  it("keeps the plain wording and no buttons while adding is off", () => {
    render(
      <OwlyTripStrip
        trip={trip}
        charges={charges}
        billsState={state({ on: false })}
        onSkip={vi.fn()}
      />,
    );
    open();
    expect(screen.getByText(/On the card, not in Owly:/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Leave out" })).not.toBeInTheDocument();
  });
});
