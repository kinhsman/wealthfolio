// money-hub patch: the "Stores skipped" part of the Receipt emails gear (owner, 2026-10-04: "I want the built in amazon
// and tiktok as templates, when users edit them the template remain unchanged, user can save their modified version as
// a new template and add icons if they want to"). A row is a COPY of a template: editing it never changes the
// template (the built-in ones are read only; the owner's own are kept by the money-hub service apart from the
// filters). An edited row can go back to its template, or be saved as a new template, with a picture if wanted.
import { useRef, useState } from "react";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Switch } from "@wealthfolio/ui/components/ui/switch";

export interface StoreTemplate {
  id: string;
  name: string;
  words: string[];
  /** A picture's address, a small picture (data:image), or an emoji. */
  icon: string | null;
}

export interface StoreRow {
  id: string;
  name: string;
  words: string;
  on: boolean;
  templateId: string | null;
  icon: string | null;
}

const btn =
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50";
const field =
  "h-8 rounded-md border bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none disabled:opacity-50";
const link = "text-primary underline-offset-4 hover:underline disabled:opacity-50";

/** Words typed in a box, as the service reads them: lower case, each once. */
export const wordsOf = (text: string): string[] => [
  ...new Set(
    text
      .split(/[\n,]/)
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean),
  ),
];

const isPicture = (icon: string) => /^(https:|data:image\/)/.test(icon);

/** A store's picture: its image, its emoji, or a shop when it has none. */
export function StoreIcon({ icon, className }: { icon: string | null; className?: string }) {
  const tile =
    "bg-muted ring-border flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md ring-1";
  return (
    <span className={`${tile} ${className ?? ""}`}>
      {icon && isPicture(icon) ? (
        <img src={icon} alt="" className="size-full bg-white object-contain" />
      ) : icon ? (
        <span className="text-base leading-none">{icon}</span>
      ) : (
        <Icons.Store className="text-muted-foreground size-4" />
      )}
    </span>
  );
}

/** A picked file as a small PNG (64 px, or 48 if that is still big), small enough to keep with the settings. */
async function pictureFrom(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    for (const size of [64, 48, 32]) {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      const data = canvas.toDataURL("image/png");
      if (data.length <= 30_000) return data;
    }
    throw new Error("That picture is too detailed. Try a simpler one.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function StoresSkipped({
  rows,
  setRows,
  builtIn,
  mine,
  busy,
  saveTemplates,
}: {
  rows: StoreRow[];
  setRows: (rows: StoreRow[]) => void;
  builtIn: StoreTemplate[];
  mine: StoreTemplate[];
  busy: boolean;
  /** Keep the owner's own templates (the list is theirs; the built-in ones are never sent). */
  saveTemplates: (list: StoreTemplate[]) => Promise<StoreTemplate[] | null>;
}) {
  const all = [...builtIn, ...mine];
  const templateOf = (r: StoreRow) => all.find((t) => t.id === r.templateId) ?? null;
  const edited = (r: StoreRow) => {
    const t = templateOf(r);
    return (
      !!t &&
      (r.name.trim() !== t.name ||
        wordsOf(r.words).join(",") !== t.words.join(",") ||
        (r.icon ?? null) !== (t.icon ?? null))
    );
  };
  const patch = (i: number, p: Partial<StoreRow>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));

  const [naming, setNaming] = useState<{ i: number; name: string } | null>(null);
  const [iconFor, setIconFor] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const addFrom = (id: string) => {
    if (!id) return;
    const t = all.find((x) => x.id === id);
    const n = Date.now().toString(36);
    setRows([
      ...rows,
      t
        ? {
            id: `${t.id}-${n}`,
            name: t.name,
            words: t.words.join(", "),
            on: true,
            templateId: t.id,
            icon: t.icon,
          }
        : { id: `new-${n}`, name: "", words: "", on: true, templateId: null, icon: null },
    ]);
  };

  const saveAsTemplate = async () => {
    if (!naming) return;
    const r = rows[naming.i];
    const name = naming.name.trim();
    if (!name || !wordsOf(r.words).length) {
      setProblem("A template needs a name and at least one word.");
      return;
    }
    setProblem(null);
    const list = await saveTemplates([
      ...mine,
      { id: "", name, words: wordsOf(r.words), icon: r.icon },
    ]);
    if (!list) return;
    // The row now comes from the new template (the server gave it its id), so it is no longer "edited".
    const made = list.find((t) => t.name === name.slice(0, 40) && !mine.some((m) => m.id === t.id));
    if (made) patch(naming.i, { templateId: made.id, name });
    setNaming(null);
  };

  return (
    <div className="space-y-0.5">
      <div className="divide-y">
        {rows.map((r, i) => {
          const t = templateOf(r);
          const changed = edited(r);
          return (
            <div
              key={r.id}
              className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 py-1.5 sm:grid-cols-[2.25rem_2rem_9rem_minmax(0,1fr)_2rem] sm:gap-x-3"
            >
              <Switch
                checked={r.on}
                aria-label={`Skip ${r.name || "this store"}`}
                onCheckedChange={(on) => patch(i, { on })}
              />
              <button
                type="button"
                className="rounded-md"
                aria-label={`Picture for ${r.name || "this store"}`}
                aria-expanded={iconFor === i}
                title="Change the picture"
                onClick={() => setIconFor(iconFor === i ? null : i)}
              >
                <StoreIcon icon={r.icon} />
              </button>
              <input
                value={r.name}
                onChange={(e) => patch(i, { name: e.target.value })}
                placeholder="Store"
                className={`${field} w-full`}
                aria-label="Store name"
              />
              <input
                value={r.words}
                onChange={(e) => patch(i, { words: e.target.value })}
                placeholder="Words its charges start with, separated by commas"
                className={`${field} order-5 col-span-4 w-full sm:order-4 sm:col-span-1`}
                aria-label={`Words for ${r.name || "this store"}`}
              />
              <button
                type="button"
                className={`${btn} order-4 h-8 px-2 sm:order-5`}
                aria-label={`Remove ${r.name || "this store"}`}
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
              >
                <Icons.Close className="size-3.5" />
              </button>

              {iconFor === i ? (
                <div className="order-6 col-span-4 flex flex-wrap items-center gap-2 text-[11px] sm:col-span-5">
                  <input
                    value={r.icon && !isPicture(r.icon) ? r.icon : ""}
                    onChange={(e) =>
                      patch(i, { icon: Array.from(e.target.value).slice(0, 4).join("") || null })
                    }
                    placeholder="Emoji"
                    className={`${field} w-16 text-center`}
                    aria-label="Emoji for this store"
                  />
                  <button
                    type="button"
                    className={`${btn} h-7`}
                    onClick={() => picker.current?.click()}
                  >
                    <Icons.Upload className="size-3.5" /> Upload a picture
                  </button>
                  {t?.icon && r.icon !== t.icon ? (
                    <button
                      type="button"
                      className={link}
                      onClick={() => patch(i, { icon: t.icon })}
                    >
                      Template&apos;s picture
                    </button>
                  ) : null}
                  {r.icon ? (
                    <button type="button" className={link} onClick={() => patch(i, { icon: null })}>
                      No picture
                    </button>
                  ) : null}
                  <input
                    ref={picker}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      pictureFrom(f)
                        .then((data) => {
                          setProblem(null);
                          patch(i, { icon: data });
                        })
                        .catch((err) =>
                          setProblem(err instanceof Error ? err.message : String(err)),
                        );
                    }}
                  />
                </div>
              ) : null}

              {changed || !t || naming?.i === i ? (
                <div className="text-muted-foreground order-7 col-span-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:col-span-5">
                  {naming?.i === i ? (
                    <>
                      <input
                        value={naming.name}
                        onChange={(e) => setNaming({ i, name: e.target.value })}
                        placeholder="Template name"
                        className={`${field} h-7 w-44`}
                        aria-label="Name for the new template"
                        // eslint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus
                      />
                      <button
                        type="button"
                        className={link}
                        disabled={busy}
                        onClick={() => void saveAsTemplate()}
                      >
                        Save template
                      </button>
                      <button type="button" className={link} onClick={() => setNaming(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span>
                        {t
                          ? `Edited copy of ${t.name}. The template is unchanged.`
                          : "Not from a template."}
                      </span>
                      {t && changed ? (
                        <button
                          type="button"
                          className={link}
                          onClick={() =>
                            patch(i, { name: t.name, words: t.words.join(", "), icon: t.icon })
                          }
                        >
                          Reset to template
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={link}
                        disabled={busy}
                        onClick={() =>
                          setNaming({
                            i,
                            name: t ? `${r.name.trim() || t.name} (mine)` : r.name.trim(),
                          })
                        }
                      >
                        Save as new template
                      </button>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 py-1.5">
        <span className="text-muted-foreground hidden text-[11px] sm:inline">
          Amazon and TikTok Shop have their own readers above. A store off here is looked for again.
        </span>
        <select
          value=""
          className={`${field} h-7`}
          aria-label="Add a store"
          onChange={(e) => addFrom(e.target.value)}
        >
          <option value="">Add a store…</option>
          <optgroup label="Built-in templates">
            {builtIn.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
          {mine.length ? (
            <optgroup label="Your templates">
              {mine.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          ) : null}
          <option value="__blank">A blank store</option>
        </select>
      </div>
      {problem ? <p className="text-warning text-[11px]">{problem}</p> : null}

      <details className="text-[11px]">
        <summary className="text-muted-foreground cursor-pointer py-1">
          Templates: {builtIn.length} built in{mine.length ? `, ${mine.length} yours` : ""}
        </summary>
        <div className="divide-y">
          {builtIn.map((t) => (
            <div key={t.id} className="flex items-center gap-2 py-1.5">
              <StoreIcon icon={t.icon} />
              <div className="min-w-0 flex-1">
                <div className="text-foreground truncate">{t.name}</div>
                <div className="text-muted-foreground truncate">{t.words.join(", ")}</div>
              </div>
              <span
                className="text-muted-foreground inline-flex items-center gap-1"
                title="Built in, it cannot be changed"
              >
                <Icons.Lock className="size-3.5" /> Built in
              </span>
            </div>
          ))}
          {mine.map((t) => (
            <div key={t.id} className="flex items-center gap-2 py-1.5">
              <StoreIcon icon={t.icon} />
              <div className="min-w-0 flex-1">
                <div className="text-foreground truncate">{t.name}</div>
                <div className="text-muted-foreground truncate">{t.words.join(", ")}</div>
              </div>
              <button
                type="button"
                className={`${btn} h-7 px-2`}
                disabled={busy}
                aria-label={`Delete the ${t.name} template`}
                title="Delete this template (stores already added keep their copy)"
                onClick={() => void saveTemplates(mine.filter((m) => m.id !== t.id))}
              >
                <Icons.Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
