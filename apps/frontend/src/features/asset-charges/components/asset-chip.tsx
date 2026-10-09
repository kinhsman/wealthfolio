// money-hub patch: a transaction's asset chip and the Edit window's "For asset" line (Linked charges). The
// service says whose a charge is (lib/charge-links.ts); here the owner can move it or take it off.
import { toast } from "sonner";

import { Icons } from "@wealthfolio/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui/components/ui/select";
import { Link } from "react-router-dom";

import { chargeLinksApi, claimOf, CHARGE_LINKS_KEY, useChargeLinks } from "../lib/charge-links";
import { useQueryClient } from "@tanstack/react-query";

/** Small house/car chip beside a payee. Nothing when the charge is for no asset. */
export function AssetChip({ chargeId }: { chargeId: string }) {
  const { data } = useChargeLinks();
  const hit = claimOf(data, chargeId);
  if (!hit) return null;
  const title = `For ${hit.asset.name}`;
  return (
    <Link
      to={`/holdings/${encodeURIComponent(hit.asset.id)}`}
      title={title}
      onClick={(e) => e.stopPropagation()}
      className="text-muted-foreground hover:text-foreground inline-flex max-w-32 shrink-0 items-center gap-1 text-xs"
    >
      <Icons.Link className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{hit.asset.name}</span>
    </Link>
  );
}

const AUTO = "__auto";

/** The Edit window's line: which asset this charge is for. "By the rules" leaves it to the asset's rules. */
export function AssetForCharge({ chargeId }: { chargeId: string }) {
  const { data } = useChargeLinks();
  const qc = useQueryClient();
  if (!data || data.assets.length === 0) return null;
  const hit = claimOf(data, chargeId);

  const choose = async (next: string) => {
    try {
      let view = data;
      if (next === AUTO) {
        // Take back any pick, then any "not this one", on every asset that has one.
        for (const a of data.assets) {
          if (a.links.include.includes(chargeId) || a.links.exclude.includes(chargeId))
            view = await chargeLinksApi.setCharge(a.id, chargeId, "clear");
        }
      } else {
        view = await chargeLinksApi.setCharge(next, chargeId, "yes");
      }
      qc.setQueryData(CHARGE_LINKS_KEY, view);
      void qc.invalidateQueries({ queryKey: ["money-hub", "upkeep"] });
      void qc.invalidateQueries({ queryKey: ["money-hub", "linked-activity-ids"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save that.");
    }
  };

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">For asset</p>
      <Select value={hit?.claim.via === "include" ? hit.asset.id : AUTO} onValueChange={choose}>
        <SelectTrigger aria-label="For asset">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" className="max-h-72">
          <SelectItem value={AUTO}>{hit ? `By the rules (${hit.asset.name})` : "None"}</SelectItem>
          {data.assets.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
