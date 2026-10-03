import { fireEvent, render, screen, waitFor } from "@/test/render";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { assetLogoRegistry } from "@/lib/asset-logo-registry";
import type { NormalizedLogoImage } from "@/lib/normalize-logo-image";
import { AltAssetIconDialog } from "./alt-asset-icon-dialog";

interface MutateOptions {
  onSuccess?: () => void;
}

const { normalizeLogoImage, setLogoMutate, resetLogoMutate } = vi.hoisted(() => ({
  normalizeLogoImage: vi.fn<(file: Blob, fit?: string) => Promise<NormalizedLogoImage>>(),
  setLogoMutate:
    vi.fn<(vars: { assetId: string; dataBase64: string }, options?: MutateOptions) => void>(),
  resetLogoMutate: vi.fn<(assetId: string, options?: MutateOptions) => void>(),
}));

vi.mock("@wealthfolio/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@wealthfolio/ui")>()),
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));
vi.mock("@/lib/normalize-logo-image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/normalize-logo-image")>()),
  normalizeLogoImage,
}));
vi.mock("@/hooks/use-asset-logos", () => ({
  useAssetLogoMutations: () => ({
    setLogo: { mutate: setLogoMutate, isPending: false },
    resetLogo: { mutate: resetLogoMutate, isPending: false },
  }),
}));
vi.mock("@/hooks/use-platform", () => ({ useIsMobileViewport: () => false }));
vi.mock("@/adapters", () => ({ getAssetLogo: vi.fn().mockResolvedValue(null) }));
vi.mock("@/features/spending/lib/merchants", () => ({
  useMerchants: () => ({
    data: [
      {
        id: "m1",
        name: "US Bank",
        pattern: "US BANK",
        logoUrl: "/api/money-hub/merchants/m1/logo",
      },
      { id: "o1", name: "A friend", pattern: "X", logoUrl: "/api/owly/x", source: "owly" },
    ],
    isLoading: false,
  }),
}));

function picture(tag: string, sourceWidth = 256, sourceHeight = 256): NormalizedLogoImage {
  return {
    blob: new Blob(["x"], { type: "image/png" }),
    width: 256,
    height: 256,
    dataBase64: tag,
    dataUri: `data:image/png;base64,${tag}`,
    sourceWidth,
    sourceHeight,
  };
}

function chooseFile() {
  const file = new File(["png"], "house.jpg", { type: "image/jpeg" });
  fireEvent.change(screen.getByTestId("alt-asset-icon-file"), { target: { files: [file] } });
  return file;
}

describe("AltAssetIconDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assetLogoRegistry.reset();
  });

  it("saves a chosen picture on the asset, filling the circle", async () => {
    normalizeLogoImage.mockResolvedValue(picture("HOUSE"));
    const onOpenChange = vi.fn();
    render(
      <AltAssetIconDialog
        open
        onOpenChange={onOpenChange}
        assetId="home"
        kind="property"
        name="Home"
      />,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Remove icon/ })).toBeNull();

    const file = chooseFile();
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    expect(normalizeLogoImage).toHaveBeenCalledWith(file, "cover");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(setLogoMutate).toHaveBeenCalledWith(
      { assetId: "home", dataBase64: "HOUSE" },
      expect.anything(),
    );
    setLogoMutate.mock.calls[0][1]?.onSuccess?.();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("offers the whole picture for a wide photo", async () => {
    normalizeLogoImage.mockResolvedValue(picture("WIDE", 1200, 600));
    render(<AltAssetIconDialog open onOpenChange={vi.fn()} assetId="home" kind="property" />);
    expect(screen.queryByRole("radio", { name: "Whole picture" })).toBeNull();
    chooseFile();
    fireEvent.click(await screen.findByRole("radio", { name: "Whole picture" }));
    await waitFor(() =>
      expect(normalizeLogoImage).toHaveBeenLastCalledWith(expect.anything(), "contain"),
    );
  });

  it("takes a pasted picture", async () => {
    normalizeLogoImage.mockResolvedValue(picture("PASTED"));
    render(<AltAssetIconDialog open onOpenChange={vi.fn()} assetId="home" kind="property" />);
    const file = new File(["png"], "x.png", { type: "image/png" });
    const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", { value: { files: [file], items: [] } });
    document.dispatchEvent(event);
    await waitFor(() => expect(normalizeLogoImage).toHaveBeenCalledWith(file, "cover"));
    expect(event.defaultPrevented).toBe(true);
  });

  it("lists the owner's own logos, not friends' photos, and uses the one picked", async () => {
    normalizeLogoImage.mockResolvedValue(picture("USBANK"));
    const blob = new Blob(["png"], { type: "image/png" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });
    vi.stubGlobal("fetch", fetchMock);
    render(<AltAssetIconDialog open onOpenChange={vi.fn()} assetId="loan" kind="liability" />);
    fireEvent.click(screen.getByRole("button", { name: /Your logos/ }));
    expect(screen.queryByText("A friend")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /US Bank/ }));
    await waitFor(() => expect(normalizeLogoImage).toHaveBeenCalledWith(blob, "cover"));
    expect(fetchMock).toHaveBeenCalledWith("/api/money-hub/merchants/m1/logo", {
      credentials: "include",
    });
    vi.unstubAllGlobals();
  });

  it("removes a saved picture", () => {
    assetLogoRegistry.setIndex([
      { assetId: "home", displayCode: "Rental", sha256: "s", updatedAt: "2026-10-03T00:00:00Z" },
    ]);
    render(<AltAssetIconDialog open onOpenChange={vi.fn()} assetId="home" kind="property" />);
    fireEvent.click(screen.getByRole("button", { name: /Remove icon/ }));
    expect(resetLogoMutate).toHaveBeenCalledWith("home", expect.anything());
  });

  it("hands the picture back for an asset not made yet", async () => {
    normalizeLogoImage.mockResolvedValue(picture("DRAFT"));
    const onDraft = vi.fn();
    render(<AltAssetIconDialog open onOpenChange={vi.fn()} kind="vehicle" onDraft={onDraft} />);
    chooseFile();
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onDraft).toHaveBeenCalledWith(expect.objectContaining({ dataBase64: "DRAFT" }));
    expect(setLogoMutate).not.toHaveBeenCalled();
  });
});
