// money-hub patch: the "Counts as" picker for a bank entry (see ../lib/counts-as.ts).
import { useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icons,
  PrivacyAmount,
} from "@wealthfolio/ui";

import { invalidateSpendingCaches } from "../lib/invalidation";
import { countsAsStore, setCountsAs, type CountsAs, type CountsAsTarget } from "../lib/counts-as";

const CHOICES: { value: Exclude<CountsAs, "auto">; label: string; out: string; in: string }[] = [
  { value: "spending", label: "Spending", out: "Money I spent. Shows in Spending.", in: "Money back, like a refund. Lowers Spending." },
  { value: "income", label: "Income", out: "", in: "Money I earned or was given. Shows in Income." },
  { value: "saving", label: "Saving", out: "Money moved to my own account or savings. Shows in Set aside.", in: "My own money coming back. Not income." },
  { value: "neutral", label: "Not counted", out: "Leave it out of every total, like something counted elsewhere.", in: "Leave it out of every total, like something counted elsewhere." },
];

export function CountsAsHost() {
  const target = useSyncExternalStore(countsAsStore.subscribe, countsAsStore.get);
  if (!target) return null;
  return <CountsAsDialog key={target.activity.id} target={target} onClose={countsAsStore.close} />;
}

function CountsAsDialog({ target, onClose }: { target: CountsAsTarget; onClose: () => void }) {
  const qc = useQueryClient();
  const a = target.activity;
  const out = a.netAmount < 0;
  const now = a.cashFlowBucket;
  const [busy, setBusy] = useState<CountsAs | null>(null);

  const pick = async (choice: CountsAs) => {
    setBusy(choice);
    try {
      const r = await setCountsAs(a.id, choice);
      invalidateSpendingCaches(qc);
      toast.success(
        r.pending
          ? "Back to the bank's choice. It is filed again within a few minutes."
          : `Now counts as ${CHOICES.find((c) => c.value === choice)?.label ?? choice}.`,
      );
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Counts as</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <span className="min-w-0 truncate">{a.notes}</span>
            <span className="shrink-0 tabular-nums">
              {out ? "-" : "+"}
              <PrivacyAmount value={Math.abs(a.netAmount)} currency={a.currency} />
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {CHOICES.filter((c) => !(c.value === "income" && out)).map((c) => {
            const on = now === c.value;
            return (
              <button
                key={c.value}
                type="button"
                disabled={busy !== null}
                onClick={() => (on ? onClose() : pick(c.value))}
                className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
                  on ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                }`}
              >
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                  {busy === c.value ? (
                    <Icons.Spinner className="h-4 w-4 animate-spin" />
                  ) : on ? (
                    <Icons.Check className="text-primary h-4 w-4" />
                  ) : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{c.label}</span>
                  <span className="text-muted-foreground block text-xs">{out ? c.out : c.in}</span>
                </span>
              </button>
            );
          })}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => pick("auto")}>
            {busy === "auto" ? <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
            Bank's choice
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
