// money-hub patch: the logo.dev key company logos use. Typed on Settings, Appearance and kept by the money-hub
// service (server/drive-backup/lib/logoKey.js); no key = no logos, the icons stay.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const BASE = "/api/money-hub/logo-key";
export const LOGO_KEY = ["money-hub", "logo-key"] as const;

async function call<T>(method: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error((data as { error?: string }).error || `The money app helper said ${res.status}`);
  return data as T;
}

export const logoKeyApi = {
  get: () => call<{ key: string | null }>("GET"),
  set: (key: string) => call<{ key: string | null }>("PUT", { key }),
};

/** The saved key (null while loading, when none is set, or when the helper is not answering). */
export function useLogoKey(): string | null {
  const q = useQuery({ queryKey: LOGO_KEY, queryFn: logoKeyApi.get, staleTime: 5 * 60 * 1000, retry: false });
  return q.data?.key ?? null;
}

export function useSetLogoKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: logoKeyApi.set,
    onSuccess: (data) => qc.setQueryData(LOGO_KEY, data),
  });
}
