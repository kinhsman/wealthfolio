import { render, screen, within } from "@/test/render";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FOREST_THEME } from "../lib/theme";
import { useOwlyTrips } from "../hooks/use-owly-trips";
import { useEventSpendingSummaries } from "../hooks/use-spending-events";
import type { EventSpendingSummary } from "../types/event";
import { EventsCard } from "./events-card";

vi.mock("../hooks/use-spending-events", () => ({
  useEventSpendingSummaries: vi.fn(),
}));

vi.mock("../hooks/use-owly-trips", () => ({
  useOwlyTrips: vi.fn(),
}));

vi.mock("./event-dialog-provider", () => ({
  useEventDialog: () => ({
    openEventDialog: vi.fn(),
    openEventTypeDialog: vi.fn(),
  }),
}));

const mockUseEventSpendingSummaries = vi.mocked(useEventSpendingSummaries);
const mockUseOwlyTrips = vi.mocked(useOwlyTrips);

const dallasTrip = {
  id: 6,
  name: "Dallas - Worlds 2026",
  emoji: null,
  startsOn: null,
  endsOn: null,
  status: "active" as const,
  currency: "USD",
  mixedCurrency: false,
  members: [],
  billCount: 3,
  totalSpent: 715.43,
  you: { paid: 715.43, share: 357.72 },
  owedToYou: 357.71,
  youOwe: 0,
  transfers: [{ from: "Thanh", to: "Sang", amount: 357.71, youOwe: false, owedToYou: true }],
};

function eventSummary(overrides: Partial<EventSpendingSummary> = {}): EventSpendingSummary {
  return {
    eventId: "event-1",
    eventName: "Sister Wedding",
    eventTypeId: "type-1",
    eventTypeName: "Wedding",
    eventTypeColor: "#123456",
    startDate: "2026-04-16",
    endDate: "2026-04-20",
    totalSpending: 0,
    transactionCount: 0,
    currency: "USD",
    byCategory: {},
    dailySpending: {},
    ...overrides,
  };
}

function renderEventsCard(periodStartDate: string, periodEndDate: string) {
  return render(
    <MemoryRouter>
      <EventsCard
        activities={[]}
        categoriesMeta={new Map()}
        eventSummaryEndDate={periodEndDate}
        eventSummaryStartDate={periodStartDate}
        periodEndDate={periodEndDate}
        periodStartDate={periodStartDate}
        theme={FOREST_THEME}
      />
    </MemoryRouter>,
  );
}

describe("EventsCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-05T12:00:00.000Z"));
    mockUseEventSpendingSummaries.mockReturnValue({
      data: [eventSummary()],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useEventSpendingSummaries>);
    mockUseOwlyTrips.mockReturnValue({
      data: { connected: false, trips: [], links: {} },
    } as unknown as ReturnType<typeof useOwlyTrips>);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("shows an event that overlaps the selected dashboard period", () => {
    renderEventsCard("2026-03-05T05:00:00.000Z", "2026-06-05T03:59:59.999Z");

    expect(screen.getByText("Sister Wedding")).toBeInTheDocument();
    expect(screen.getByText("PERIOD")).toBeInTheDocument();
    expect(screen.queryByText("No events in this period")).not.toBeInTheDocument();
  });

  it("keeps the empty state when events are outside the selected dashboard period", () => {
    renderEventsCard("2026-05-01T04:00:00.000Z", "2026-06-05T03:59:59.999Z");

    expect(screen.getByText("No events in this period")).toBeInTheDocument();
    expect(screen.queryByText("Sister Wedding")).not.toBeInTheDocument();
  });

  it("shows event-reporting totals from summaries even without period activities", () => {
    mockUseEventSpendingSummaries.mockReturnValue({
      data: [
        eventSummary({
          totalSpending: 450,
          transactionCount: 1,
          dailySpending: { "2026-03-20": 450 },
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useEventSpendingSummaries>);

    renderEventsCard("2026-03-05T05:00:00.000Z", "2026-06-05T03:59:59.999Z");

    expect(screen.getByText("Sister Wedding")).toBeInTheDocument();
    expect(screen.getByText(/spent so far/)).toHaveTextContent("1 transaction");
    expect(screen.queryByText("No tagged transactions yet")).not.toBeInTheDocument();
  });

  it("shows prepaid spend for an upcoming event instead of the countdown-only state", () => {
    mockUseEventSpendingSummaries.mockReturnValue({
      data: [
        eventSummary({
          eventName: "Summer Trip",
          startDate: "2026-06-20",
          endDate: "2026-06-25",
          totalSpending: 450,
          transactionCount: 1,
          dailySpending: { "2026-06-01": 450 },
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useEventSpendingSummaries>);

    renderEventsCard("2026-06-01T04:00:00.000Z", "2026-06-30T03:59:59.999Z");

    expect(screen.getByText("Summer Trip")).toBeInTheDocument();
    expect(screen.getByText("SOON")).toBeInTheDocument();
    expect(screen.getByText(/spent so far/)).toHaveTextContent("1 transaction");
    expect(screen.queryByText(/planned/)).not.toBeInTheDocument();
  });

  it("shows the linked Owly trip on the event, with who owes the owner", () => {
    mockUseEventSpendingSummaries.mockReturnValue({
      data: [
        eventSummary({
          eventId: "ev-dallas",
          eventName: "Dallas trip",
          startDate: "2026-06-20",
          endDate: "2026-06-22",
          totalSpending: 715.43,
          transactionCount: 3,
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useEventSpendingSummaries>);
    mockUseOwlyTrips.mockReturnValue({
      data: { connected: true, baseUrl: "https://owly.example", trips: [dallasTrip], links: { "ev-dallas": 6 } },
    } as unknown as ReturnType<typeof useOwlyTrips>);

    renderEventsCard("2026-06-01T04:00:00.000Z", "2026-06-30T03:59:59.999Z");

    const strip = screen.getByTestId("owly-trip-strip");
    expect(strip).toHaveTextContent("Dallas - Worlds 2026");
    expect(strip).toHaveTextContent("Thanh owes you");
    expect(strip).toHaveTextContent("Cost to you after they pay back");
    expect(within(strip).getByRole("link", { name: /open/i })).toHaveAttribute("href", "https://owly.example/trips/6");
  });

  it("shows no Owly strip for an event with no link", () => {
    mockUseOwlyTrips.mockReturnValue({
      data: { connected: true, trips: [dallasTrip], links: { "some-other-event": 6 } },
    } as unknown as ReturnType<typeof useOwlyTrips>);
    renderEventsCard("2026-03-05T05:00:00.000Z", "2026-06-05T03:59:59.999Z");
    expect(screen.queryByTestId("owly-trip-strip")).not.toBeInTheDocument();
  });
});
