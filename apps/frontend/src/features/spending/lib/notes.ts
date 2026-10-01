// money-hub patch: the owner's own note on a transaction, apart from its name (owner, 2026-10-01:
// "separate Name and Notes for transactions, I want to add notes but i dont want to display it in
// the name"). The money app keeps one text per entry, the payee, which is the name in the list, so
// notes live in the money-hub service (server/drive-backup/lib/notes.js, helper/notes.json by entry
// id). The transaction search finds them through the bank search (lib/bank-lines.ts bankHits).
import { useQuery, type QueryClient } from "@tanstack/react-query";

const BASE = "/api/money-hub/notes";
const KEY = ["money-hub", "notes"];

/** Entry id -> the owner's note. */
export type Notes = Record<string, string>;

export function useNotes() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Notes> => {
      const res = await fetch(BASE, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });
}

/** Saves one entry's note (empty text removes it) when it changed. */
export async function saveNote(qc: QueryClient, activityId: string, note: string) {
  const next = note.trim();
  const now = qc.getQueryData<Notes>(KEY)?.[activityId] ?? "";
  if (next === now) return;
  const res = await fetch(`${BASE}/${encodeURIComponent(activityId)}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note: next }),
  });
  if (!res.ok) throw new Error("The note could not be saved.");
  qc.setQueryData<Notes>(KEY, (old) => {
    const out = { ...(old ?? {}) };
    if (next) out[activityId] = next;
    else delete out[activityId];
    return out;
  });
}
