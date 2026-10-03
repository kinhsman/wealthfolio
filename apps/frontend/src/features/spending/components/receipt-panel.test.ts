import { describe, expect, it } from "vitest";
import { imagesIn } from "./receipt-panel";

const file = (name: string, type: string) => new File(["x"], name, { type });
const item = (f: File | null, kind = "file") => ({ kind, type: f?.type ?? "text/plain", getAsFile: () => f });

describe("pasted receipt photos", () => {
  it("takes the pictures on the clipboard, not its text", () => {
    const png = file("shot.png", "image/png");
    const dt = { items: [item(null, "string"), item(png), item(file("a.pdf", "application/pdf"))], files: [] };
    expect(imagesIn(dt as never)).toEqual([png]);
  });

  it("reads the files list when the items have none, and nothing from an empty paste", () => {
    const jpg = file("r.jpg", "image/jpeg");
    expect(imagesIn({ items: [], files: [jpg] } as never)).toEqual([jpg]);
    expect(imagesIn(null)).toEqual([]);
    expect(imagesIn({ items: [item(null, "string")], files: [] } as never)).toEqual([]);
  });
});
