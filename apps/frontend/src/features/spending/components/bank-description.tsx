// money-hub patch: what the bank sent for a bank entry (owner, 2026-10-01). The payee shows "City
// of Chicago" while the bank says "CITY OF CHICAGO WATER BILL 1364743-375285 WEB ID: 1366005820",
// so the bank's own line is shown word for word, and under it every field of the transaction as
// Plaid sent it, empty ones too ("include all fields of the transaction plaid provide, do not miss
// anything"). Read-only: it is the bank's record; the payee above stays editable.
// Served by the money-hub service (/api/money-hub/plaid/details, server/drive-backup/lib/plaidSync.js).
import { useQuery } from "@tanstack/react-query";

interface BankDetails {
  description: string;
  transaction: Record<string, unknown> | null;
}

export function useBankDetails(activityId: string | undefined) {
  return useQuery({
    queryKey: ["money-hub", "plaid", "details", activityId],
    queryFn: async (): Promise<BankDetails> => {
      const res = await fetch(`/api/money-hub/plaid/details/${encodeURIComponent(activityId!)}`, {
        credentials: "include",
      });
      if (!res.ok) return { description: "", transaction: null };
      return res.json();
    },
    enabled: !!activityId,
    staleTime: 10 * 60 * 1000,
  });
}

/** Every leaf of the transaction as [path, value], nested objects and lists included. */
export function flattenFields(value: unknown, path: string[] = []): [string[], unknown][] {
  if (Array.isArray(value)) {
    if (!value.length) return [[path, null]];
    return value.flatMap((v, i) => flattenFields(v, [...path, String(i + 1)]));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) return [[path, null]];
    return entries.flatMap(([k, v]) => flattenFields(v, [...path, k]));
  }
  return [[path, value]];
}

const label = (path: string[]) =>
  path
    .map((p) => {
      const words = p.replace(/_/g, " ");
      return words.charAt(0).toUpperCase() + words.slice(1);
    })
    .join(" · ");

function Value({ v }: { v: unknown }) {
  if (v === null || v === undefined || v === "") return <span className="opacity-50">—</span>;
  if (typeof v === "boolean") return <>{v ? "Yes" : "No"}</>;
  const text = String(v);
  if (/^https?:\/\//.test(text)) {
    return (
      <a href={text} target="_blank" rel="noreferrer" className="underline underline-offset-2">
        {text}
      </a>
    );
  }
  return <>{text}</>;
}

export function BankDescription({ activityId }: { activityId: string | undefined }) {
  const { data } = useBankDetails(activityId);
  if (!data?.description && !data?.transaction) return null;
  const fields = data.transaction ? flattenFields(data.transaction) : [];
  return (
    <div className="space-y-3">
      {data.description ? (
        <div className="space-y-1.5">
          <div className="text-sm font-medium">Bank description</div>
          <div className="bg-muted/40 text-muted-foreground select-text break-words rounded-md border px-3 py-2 font-mono text-xs leading-relaxed">
            {data.description}
          </div>
        </div>
      ) : null}
      {fields.length ? (
        <details className="group rounded-md border">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer select-none px-3 py-2 text-sm">
            All bank details ({fields.length} fields)
          </summary>
          <dl className="divide-y border-t text-xs">
            {fields.map(([path, v]) => (
              <div key={path.join(".")} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-3 py-1.5">
                <dt className="text-muted-foreground break-words">{label(path)}</dt>
                <dd className="select-text break-words font-mono">
                  <Value v={v} />
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
    </div>
  );
}
