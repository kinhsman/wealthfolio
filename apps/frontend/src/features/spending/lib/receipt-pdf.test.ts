import { describe, expect, it } from "vitest";
import {
  contentBox,
  fitScale,
  hasPicture,
  isPdf,
  pictureName,
  receiptFileName,
} from "./receipt-pdf";

/** A width x height page of white pixels with black ink at the given points. */
function page(width: number, height: number, ink: [number, number][] = []) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const [x, y] of ink) data.set([0, 0, 0, 255], (y * width + x) * 4);
  return data;
}

describe("trimming a PDF page to its content", () => {
  it("finds the box around the ink, end edges exclusive", () => {
    expect(
      contentBox(
        page(10, 8, [
          [2, 3],
          [6, 5],
        ]),
        10,
        8,
      ),
    ).toEqual({ x0: 2, y0: 3, x1: 7, y1: 6 });
  });
  it("is null for a blank page", () => {
    expect(contentBox(page(10, 8), 10, 8)).toBeNull();
  });
  it("counts light grey text, not just black", () => {
    const data = page(4, 4);
    data.set([200, 200, 200, 255], (1 * 4 + 1) * 4);
    expect(contentBox(data, 4, 4)).toEqual({ x0: 1, y0: 1, x1: 2, y1: 2 });
  });
  it("ignores a transparent pixel", () => {
    const data = new Uint8ClampedArray(4 * 4 * 4); // all transparent black
    expect(contentBox(data, 4, 4)).toBeNull();
  });
});

describe("the picture sent to the server", () => {
  it("is shrunk to fit 1400 x 4200 and never enlarged", () => {
    expect(fitScale(698, 2455)).toBe(1);
    expect(fitScale(2800, 1000)).toBe(0.5);
    expect(fitScale(1000, 8400)).toBe(0.5);
    expect(fitScale(1400, 4200)).toBe(1);
  });
  it("takes the PDF's name with .jpg", () => {
    expect(pictureName("Orders & Purchases _ Costco3.pdf")).toBe(
      "Orders & Purchases _ Costco3.jpg",
    );
    expect(pictureName("receipt.PDF")).toBe("receipt.jpg");
    expect(pictureName(".pdf")).toBe("receipt.jpg");
  });
  it("tells a PDF by type or by name", () => {
    expect(isPdf({ type: "application/pdf", name: "x" })).toBe(true);
    expect(isPdf({ type: "", name: "Costco.PDF" })).toBe(true);
    expect(isPdf({ type: "image/jpeg", name: "x.jpg" })).toBe(false);
  });
});

describe("the downloaded file", () => {
  it("is named by store, day and total", () => {
    expect(receiptFileName({ store: "COSTCO WHOLESALE", date: "2026-05-30", total: 152.17 })).toBe(
      "Costco Wholesale 2026-05-30 152.17.jpg",
    );
  });
  it("numbers a second photo and drops characters a file name cannot hold", () => {
    expect(receiptFileName({ store: "A/B: Shop", date: null, total: 5 }, 1, 2)).toBe(
      "A B Shop 5.00 (2).jpg",
    );
  });
  it("has a name even when nothing was read", () => {
    expect(receiptFileName({ store: null, date: null, total: null })).toMatch(/\.jpg$/);
  });
});

describe("which receipts have a picture to show", () => {
  it("a photo does; one from Gmail or an Amazon order does not", () => {
    expect(hasPicture({ source: "photo", photos: 1 })).toBe(true);
    expect(hasPicture({ source: "gmail", photos: 0 })).toBe(false);
    expect(hasPicture({ source: "amazon", photos: 0 })).toBe(false);
    expect(hasPicture({ source: "photo", photos: 0 })).toBe(false);
  });
});
