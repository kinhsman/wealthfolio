// money-hub patch: Settings, Appearance, Company logos. The logo.dev key the web pages use to show logos (an airline's
// on each Trips flight). It is logo.dev's PUBLISHABLE key (starts pk_), the same kind WheelTradr uses; the money-hub
// service keeps it (server/drive-backup/lib/logoKey.js). No key = no logos, the icons stay.
import { useEffect, useState } from "react";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useLogoKey, useSetLogoKey } from "@/features/trips/lib/logo-key";

export function LogoKeyCard() {
  const saved = useLogoKey();
  const set = useSetLogoKey();
  const [text, setText] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setText(saved ?? ""), [saved]);

  const dirty = text.trim() !== (saved ?? "");
  const save = (value: string) =>
    set.mutate(value, {
      onSuccess: (d) => setNote({ ok: true, text: d.key ? "Saved. Logos show now." : "Removed. The icons stay." }),
      onError: (e) => setNote({ ok: false, text: e instanceof Error ? e.message : String(e) }),
    });

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Company logos</h3>
        <p className="text-muted-foreground text-xs">
          An airline&apos;s logo on each flight in Trips. Uses your logo.dev publishable key (starts pk_), the
          same one WheelTradr uses. Empty means no logos.
        </p>
      </div>
      <div className="bg-card rounded-xl border p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setNote(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && dirty && !set.isPending) save(text.trim());
            }}
            autoComplete="off"
            spellCheck={false}
            placeholder="pk_..."
            aria-label="logo.dev publishable key"
            className="min-w-0 flex-1 font-mono text-xs"
          />
          <Button type="button" size="sm" disabled={!dirty || set.isPending} onClick={() => save(text.trim())}>
            {set.isPending ? <Icons.Spinner className="size-3.5 animate-spin" /> : <Icons.Check className="size-3.5" />}
            Save
          </Button>
        </div>
        {note ? (
          <p className={`mt-2 text-xs ${note.ok ? "text-success" : "text-destructive"}`}>{note.text}</p>
        ) : null}
      </div>
    </section>
  );
}
