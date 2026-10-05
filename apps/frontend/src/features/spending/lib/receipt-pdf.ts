// money-hub patch: a receipt that is a PDF (owner, 2026-10-04: "yes add the PDF upload button"). The server
// reads pictures only, so the PDF is turned into ONE tall picture here, in the browser, and goes through the
// same upload as a snapped photo (nothing new on the server). Every page is drawn at 150 dpi (a printed
// receipt's small type stays readable), trimmed of its white margins, and the pages are stacked top to bottom.
// Costco's "Print" from costco.com puts one receipt on 2 or 3 pages with the browser's date and address lines
// on each: the AI reads past them (checked on real ones), so nothing else is cropped.
// The PDF reader (pdf.js) is loaded only when a PDF is picked.

import { storeName, type Receipt } from "./receipts";

const SCALE = 150 / 72;
/** A receipt is a page or two; more than this is a document, not a receipt. */
export const MAX_PDF_PAGES = 6;
/** White margin kept around the content, in pixels. */
const PAD = 24;
const GAP = 12;
/** The server shrinks a picture to fit 1400 x 4200 anyway: no point sending more. */
const MAX_WIDTH = 1400;
const MAX_HEIGHT = 4200;
/** A pixel counts as ink when any colour is below this. */
const WHITE = 240;

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The smallest box around everything that is not white (pure); null for a blank page. `x1` and `y1` are exclusive. */
export function contentBox(data: ArrayLike<number>, width: number, height: number): Box | null {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const i = row + x * 4;
      if (data[i + 3] === 0) continue;
      if (data[i] < WHITE || data[i + 1] < WHITE || data[i + 2] < WHITE) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/** How much to shrink a width x height picture so it fits the server's size (pure); never above 1. */
export const fitScale = (width: number, height: number) =>
  Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height);

/** "Orders & Purchases _ Costco3.pdf" -> "Orders & Purchases _ Costco3.jpg" (pure). */
export const pictureName = (pdfName: string) =>
  `${pdfName.replace(/\.pdf$/i, "") || "receipt"}.jpg`;

export const isPdf = (f: Pick<File, "type" | "name">) =>
  f.type === "application/pdf" || /\.pdf$/i.test(f.name);

/** The PDF as one JPEG: its pages, trimmed, stacked top to bottom. Throws a plain sentence when it cannot. */
export async function pdfToPicture(file: File): Promise<File> {
  const pdfjs = await import("pdfjs-dist");
  // The build bundles the reader's worker as a plain .js file; a separate .mjs asset would depend on how the
  // server types it.
  pdfjs.GlobalWorkerOptions.workerPort ??= new Worker(
    new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
    { type: "module" },
  );

  let doc;
  try {
    // isEvalSupported off: the app's security policy has no unsafe-eval.
    doc = await pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
    }).promise;
  } catch {
    throw new Error("That PDF could not be opened. Is it protected with a password?");
  }

  try {
    if (doc.numPages > MAX_PDF_PAGES)
      throw new Error(`That PDF has ${doc.numPages} pages. A receipt is at most ${MAX_PDF_PAGES}.`);
    const strips: { canvas: HTMLCanvasElement; box: Box }[] = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("This browser can't draw the PDF.");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const box = contentBox(
        ctx.getImageData(0, 0, canvas.width, canvas.height).data,
        canvas.width,
        canvas.height,
      );
      if (box) strips.push({ canvas, box });
      page.cleanup();
    }
    if (!strips.length) throw new Error("That PDF has nothing on it.");

    const x0 = Math.min(...strips.map((s) => s.box.x0)) - PAD;
    const x1 = Math.max(...strips.map((s) => s.box.x1)) + PAD;
    const width = x1 - x0;
    const cuts = strips.map((s) => ({
      s,
      y0: Math.max(0, s.box.y0 - PAD / 3),
      y1: Math.min(s.canvas.height, s.box.y1 + PAD / 3),
    }));
    const height = cuts.reduce((sum, c) => sum + (c.y1 - c.y0), 0) + GAP * (cuts.length - 1);
    const k = fitScale(width, height);

    const out = document.createElement("canvas");
    out.width = Math.round(width * k);
    out.height = Math.round(height * k);
    const octx = out.getContext("2d");
    if (!octx) throw new Error("This browser can't draw the PDF.");
    octx.fillStyle = "#fff";
    octx.fillRect(0, 0, out.width, out.height);
    let y = 0;
    for (const c of cuts) {
      const h = c.y1 - c.y0;
      // A page narrower than the widest is drawn from its own left edge (x0 may be negative: the white margin).
      const sx = Math.max(0, x0);
      octx.drawImage(
        c.s.canvas,
        sx,
        c.y0,
        Math.min(width, c.s.canvas.width - sx),
        h,
        (sx - x0) * k,
        y * k,
        Math.min(width, c.s.canvas.width - sx) * k,
        h * k,
      );
      y += h + GAP;
      c.s.canvas.width = 0;
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      out.toBlob(resolve, "image/jpeg", 0.9),
    );
    if (!blob) throw new Error("The PDF could not be turned into a picture.");
    return new File([blob], pictureName(file.name), { type: "image/jpeg" });
  } finally {
    void doc.destroy();
  }
}

/** A receipt that has a picture of its own (not one found in Gmail, nor an Amazon order). */
export const hasPicture = (r: Pick<Receipt, "photos" | "source">) =>
  r.source !== "gmail" && r.source !== "amazon" && r.photos > 0;

/** "Costco Wholesale 2026-05-30 152.17.jpg": what the downloaded file is called (pure); `(2)` for a second photo. */
export function receiptFileName(
  r: Pick<Receipt, "store" | "date" | "total">,
  n = 0,
  count = 1,
): string {
  const parts = [
    storeName(r.store),
    r.date,
    r.total != null ? r.total.toFixed(2) : null,
    count > 1 ? `(${n + 1})` : null,
  ].filter(Boolean);
  return `${
    parts
      .join(" ")
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Receipt"
  }.jpg`;
}
