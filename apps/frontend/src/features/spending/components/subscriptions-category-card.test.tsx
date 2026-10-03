import { render, screen } from "@/test/render";
import { describe, expect, it, vi } from "vitest";
import type { Stream } from "../lib/subscriptions";
import { SubscriptionsCategoryWidget } from "./subscriptions-category-card";

vi.mock("@/hooks/use-taxonomies", () => ({
  useTaxonomy: () => ({
    data: {
      categories: [
        { id: "cat-utilities", name: "Utilities", color: "#3b82f6", icon: "lightning", parentId: null },
        { id: "cat-streaming", name: "Streaming", color: "#ec4899", icon: "television", parentId: null },
      ],
    },
  }),
}));

const mkStream = (overrides: Partial<Stream>): Stream =>
  ({
    key: "k1",
    name: "Test Stream",
    every: "month",
    status: "active",
    usual: 100,
    monthly: 100,
    yearly: 1200,
    categoryId: null,
    charges: [],
    ...overrides,
  }) as unknown as Stream;

describe("SubscriptionsCategoryWidget", () => {
  it("renders category breakdown with pie chart and amounts", () => {
    const items: Stream[] = [
      mkStream({ key: "s1", name: "Electric", categoryId: "cat-utilities", monthly: 150 }),
      mkStream({ key: "s2", name: "Water", categoryId: "cat-utilities", monthly: 50 }),
      mkStream({ key: "s3", name: "Netflix", categoryId: "cat-streaming", monthly: 20 }),
      mkStream({ key: "s4", name: "Gym", categoryId: null, monthly: 30 }),
      mkStream({ key: "s5", name: "Mortgage Escrow", categoryId: "cat-utilities", escrow: {} as any, monthly: 500 }), // should be excluded
      mkStream({ key: "s6", name: "Cancelled", status: "stopped", monthly: 100 }), // should be excluded
    ];

    render(<SubscriptionsCategoryWidget items={items} currency="USD" />);

    expect(screen.getByText("By category")).toBeInTheDocument();
    expect(screen.getByText("Utilities")).toBeInTheDocument();
    expect(screen.getByText("Streaming")).toBeInTheDocument();
    expect(screen.getByText("Uncategorized")).toBeInTheDocument();

    // Total monthly is 150 + 50 + 20 + 30 = 250
    expect(screen.getByText("$250.00")).toBeInTheDocument();
    // Utilities: 200 (80%)
    expect(screen.getByText("$200.00")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    // Uncategorized: 30 (12%)
    expect(screen.getByText("$30.00")).toBeInTheDocument();
    expect(screen.getByText("12%")).toBeInTheDocument();
    // Streaming: 20 (8%)
    expect(screen.getByText("$20.00")).toBeInTheDocument();
    expect(screen.getByText("8%")).toBeInTheDocument();
  });

  it("returns null when no active items exist", () => {
    const items = [mkStream({ status: "stopped" })];
    const { container } = render(<SubscriptionsCategoryWidget items={items} />);
    expect(container.firstChild).toBeNull();
  });
});
