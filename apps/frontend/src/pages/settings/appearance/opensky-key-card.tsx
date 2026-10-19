// money-hub patch: Settings, Appearance, Flight tracking. The OpenSky Network login (free) that Trips uses to show where
// a booked flight is right now. The money-hub service keeps it (server/drive-backup/lib/flightTrack.js) and checks it
// with OpenSky before saving; the secret is never shown again. Empty both boxes and Save to turn tracking off.
import { useEffect, useState } from "react";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useOpenSkyKey, useSetOpenSkyKey } from "@/features/trips/lib/flight-track";

export function OpenSkyKeyCard() {
  const saved = useOpenSkyKey().data;
  const set = useSetOpenSkyKey();
  const [id, setId] = useState("");
  const [secret, setSecret] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setId(saved?.clientId ?? ""), [saved?.clientId]);

  const clearing = !id.trim() && !secret.trim();
  const dirty = clearing ? Boolean(saved?.set) : Boolean(id.trim() && secret.trim());
  const save = () =>
    set.mutate(
      { clientId: id.trim(), clientSecret: secret.trim() },
      {
        onSuccess: (d) => {
          setSecret("");
          setNote({ ok: true, text: d.set ? "Saved. OpenSky took the login." : "Removed. Flights are not tracked." });
        },
        onError: (e) => setNote({ ok: false, text: e instanceof Error ? e.message : String(e) }),
      },
    );
  const edit = (f: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    f(e.target.value);
    setNote(null);
  };

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Flight tracking</h3>
        <p className="text-muted-foreground text-xs">
          Where a flight in Trips is right now. Uses your free OpenSky Network login (the client id and secret from
          its credentials file). The secret is not shown again once saved.
        </p>
      </div>
      <div className="bg-card rounded-xl border p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={id}
            onChange={edit(setId)}
            autoComplete="off"
            spellCheck={false}
            placeholder="Client id"
            aria-label="OpenSky client id"
            className="min-w-0 flex-1 font-mono text-xs"
          />
          <Input
            value={secret}
            onChange={edit(setSecret)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && dirty && !set.isPending) save();
            }}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={saved?.set ? "Secret saved" : "Client secret"}
            aria-label="OpenSky client secret"
            className="min-w-0 flex-1 font-mono text-xs"
          />
          <Button type="button" size="sm" disabled={!dirty || set.isPending} onClick={save}>
            {set.isPending ? <Icons.Spinner className="size-3.5 animate-spin" /> : <Icons.Check className="size-3.5" />}
            Save
          </Button>
        </div>
        {note ? (
          <p className={`mt-2 text-xs ${note.ok ? "text-success" : "text-destructive"}`}>{note.text}</p>
        ) : saved?.set ? (
          <p className="text-muted-foreground mt-2 text-xs">On. Flights show live from 90 minutes before they leave.</p>
        ) : null}
      </div>
    </section>
  );
}
