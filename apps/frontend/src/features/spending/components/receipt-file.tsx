// money-hub patch: the receipt's picture, to look at and to keep, and PDF receipts (owner, 2026-10-04: "yes add
// the PDF upload button; also i cannot see the receipt photos", "make a view/download receipt button").
// View and Download sit in a receipt's action row (receipt-panel.tsx); the picture itself is shown beside the
// lines on the Receipts page, so what the AI read can be checked against the receipt without leaving it.
// A PDF is turned into one picture in the browser (lib/receipt-pdf.ts), then sent like a snapped photo.
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button, Icons } from "@wealthfolio/ui";
import { cn } from "@/lib/utils";

import { hasPicture, isPdf, pdfToPicture, receiptFileName } from "../lib/receipt-pdf";
import { photoUrl, storeName, type Receipt } from "../lib/receipts";

type Pictured = Pick<Receipt, "id" | "photos" | "source" | "store" | "date" | "total">;

const link = "text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline";

/** View (the picture, full size, in a new tab) and Download (the file), for each photo of the receipt. */
export function ReceiptFileLinks({ receipt: r }: { receipt: Pictured }) {
  if (!hasPicture(r)) return null;
  const count = Math.max(1, r.photos);
  return (
    <>
      {Array.from({ length: count }, (_, n) => (
        <span key={n} className="flex items-center gap-3">
          <a
            href={photoUrl(r.id, n)}
            target="_blank"
            rel="noreferrer"
            className={link}
            title="Open the receipt picture full size"
          >
            <Icons.Eye className="size-3.5" />
            View{count > 1 ? ` ${n + 1}` : ""}
          </a>
          <a
            href={photoUrl(r.id, n)}
            download={receiptFileName(r, n, count)}
            className={link}
            title="Save the receipt picture"
          >
            <Icons.Download className="size-3.5" />
            Download{count > 1 ? ` ${n + 1}` : ""}
          </a>
        </span>
      ))}
    </>
  );
}

/** The receipt's picture beside its lines (wide screens; a phone has View). Scrolls inside its frame when tall. */
export function ReceiptPhotoPanel({
  receipt: r,
  className,
}: {
  receipt: Pictured;
  className?: string;
}) {
  if (!hasPicture(r)) return null;
  return (
    <div
      className={cn(
        "bg-muted/30 hidden max-h-[80vh] shrink-0 space-y-2 self-start overflow-y-auto rounded-md border p-1.5 lg:sticky lg:top-4 lg:block lg:w-[26rem]",
        className,
      )}
    >
      {Array.from({ length: Math.max(1, r.photos) }, (_, n) => (
        <a
          key={n}
          href={photoUrl(r.id, n)}
          target="_blank"
          rel="noreferrer"
          title="Open the receipt picture full size"
          className="block"
        >
          <img
            src={photoUrl(r.id, n)}
            alt={`Receipt ${storeName(r.store)}${r.photos > 1 ? `, photo ${n + 1}` : ""}`}
            className="w-full rounded bg-white"
            loading="lazy"
          />
        </a>
      ))}
    </div>
  );
}

const errorText = (e: unknown) => (e as Error)?.message ?? String(e);

/**
 * The Upload PDF button: each PDF picked is one receipt (a picture of its pages, read like a photo). `send`
 * is the page's shared uploader, so its busy state shows on every button.
 */
export function UploadPdfButton({
  send,
  busy,
  children,
  className,
  variant = "outline",
  size = "sm",
}: {
  send: (files: File[]) => Promise<void>;
  busy: boolean;
  children?: ReactNode;
  className?: string;
  variant?: "outline" | "ghost" | "default";
  size?: "sm" | "icon" | "default";
}) {
  const input = useRef<HTMLInputElement>(null);
  const [opening, setOpening] = useState(false);

  const pick = async (files: File[]) => {
    const pdfs = files.filter(isPdf);
    if (!pdfs.length) {
      toast.error("Pick a PDF file.");
      return;
    }
    setOpening(true);
    try {
      for (const pdf of pdfs) {
        const id = toast.loading(pdfs.length > 1 ? `Opening ${pdf.name}…` : "Opening the PDF…");
        let picture: File;
        try {
          picture = await pdfToPicture(pdf);
        } catch (e) {
          toast.dismiss(id);
          toast.error(pdfs.length > 1 ? `${pdf.name}: ${errorText(e)}` : errorText(e));
          continue;
        }
        toast.dismiss(id);
        await send([picture]);
      }
    } finally {
      setOpening(false);
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void pick(files);
        }}
      />
      <Button
        type="button"
        variant={variant}
        size={size}
        title="Upload a PDF receipt"
        aria-label="Upload a PDF receipt"
        disabled={busy || opening}
        className={className}
        onClick={() => input.current?.click()}
      >
        {opening ? (
          <Icons.Spinner className="size-4 animate-spin" />
        ) : (
          (children ?? <Icons.FileText className="size-4" />)
        )}
      </Button>
    </>
  );
}
