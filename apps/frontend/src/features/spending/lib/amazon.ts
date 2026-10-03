// money-hub patch: Amazon orders on their card charges (owner, 2026-10-02: "amazon order we can also
// track a return automatically very good idea, no need for an extension at all"). The money-hub service
// reads Amazon's own emails from the linked Gmails and matches each Amazon charge to its order
// (server/drive-backup/lib/amazon.js); returns Amazon confirms go onto the Returns page there.
import { useQuery } from "@tanstack/react-query";

export interface AmazonItem {
  name: string;
  qty: number;
  price?: number;
}

export interface AmazonReturn {
  item: string;
  refund: number | null;
  requested: string | null;
  dropped: string | null;
  refunded: string | null;
}

/** One charge's order. Since mid 2026 Amazon's emails no longer name the products: `label` then says
 *  what kind ("Coffee Accessories") and `items` is empty; the link opens the order on Amazon. */
export interface AmazonLink {
  orderId: string;
  url: string;
  how: "shipment" | "order";
  placed: string | null;
  delivered: string | null;
  label: string | null;
  count: number | null;
  items: AmazonItem[];
  orderTotal: number | null;
  returns: AmazonReturn[];
}

export type AmazonLinks = Record<string, AmazonLink>;

export const AMAZON_LINKS_KEY = ["money-hub", "amazon", "links"] as const;

export function useAmazonLinks() {
  return useQuery({
    queryKey: AMAZON_LINKS_KEY,
    queryFn: async (): Promise<AmazonLinks> => {
      const res = await fetch("/api/money-hub/amazon/links", { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });
}

/** What the charge was for, in a line: the first item (and how many more), else the kind Amazon names. */
export function amazonSummary(link: AmazonLink): string {
  const items = link.items;
  if (items.length) {
    const more = items.length - 1;
    return more > 0 ? `${items[0].name} +${more}` : items[0].name;
  }
  if (link.label) return link.count && link.count > 1 ? `${link.count} ${link.label} items` : link.label;
  return `Amazon order ${link.orderId}`;
}

/** Where a return stands, in two words. */
export function amazonReturnState(r: AmazonReturn): string {
  if (r.refunded) return "Refunded";
  if (r.dropped) return "Sent back";
  return "Return started";
}
