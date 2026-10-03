import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AlternativeAssetKind } from "@/lib/types";
import { AlternativeAssetQuickAddModal } from "./alternative-asset-quick-add-modal";

const create = vi.hoisted(() =>
  vi
    .fn<(request: unknown) => Promise<{ assetId: string }>>()
    .mockResolvedValue({ assetId: "created" }),
);
const setLogo = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-asset-logos", () => ({
  useAssetLogoMutations: () => ({ setLogo: { mutate: setLogo } }),
}));
// money-hub: the icon window, reduced to "pick this picture".
vi.mock("@/components/alt-asset-icon-dialog", () => ({
  AltAssetIconDialog: ({
    open,
    onDraft,
  }: {
    open: boolean;
    onDraft?: (picture: { dataBase64: string; dataUri: string }) => void;
  }) =>
    open ? (
      <button type="button" onClick={() => onDraft?.({ dataBase64: "PNG", dataUri: "data:,x" })}>
        Use picture
      </button>
    ) : null,
}));
vi.mock("@/lib/settings-provider", () => ({
  useSettingsContext: () => ({ settings: { baseCurrency: "USD" } }),
}));
vi.mock("../hooks/use-alternative-asset-mutations", () => ({
  useAlternativeAssetMutations: ({
    onCreateSuccess,
  }: {
    onCreateSuccess?: (response: { assetId: string }) => void;
  }) => ({
    createMutation: {
      mutateAsync: async (request: unknown) => {
        const response = await create(request);
        onCreateSuccess?.(response);
        return response;
      },
      isPending: false,
    },
  }),
}));
vi.mock("@wealthfolio/ui", () => ({
  Avatar: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  AvatarImage: ({ src }: { src?: string }) => <img alt="" src={src} />,
  AvatarFallback: () => null,
  CurrencyInput: () => null,
  DatePickerInput: () => null,
  QuantityInput: () => null,
  MoneyInput: ({
    value,
    onValueChange,
  }: {
    value: string;
    onValueChange: (value: string) => void;
  }) => (
    <input
      aria-label="Amount"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    />
  ),
  ResponsiveSelect: ({
    value,
    onValueChange,
    options,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    options: { value: string; label: string }[];
  }) => (
    <select aria-label="Type" value={value} onChange={(event) => onValueChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

beforeEach(() => {
  create.mockClear();
  setLogo.mockClear();
});

it.each([undefined, "auto_loan"])(
  "saves the displayed liability type without touching the selector (preset %s)",
  async (defaultLiabilityType) => {
    render(
      <AlternativeAssetQuickAddModal
        open
        onOpenChange={() => undefined}
        defaultKind={AlternativeAssetKind.LIABILITY}
        defaultName="Loan"
        defaultLiabilityType={defaultLiabilityType}
      />,
    );
    expect(await screen.findByRole("combobox")).toHaveValue(defaultLiabilityType ?? "mortgage");
    fireEvent.change(screen.getAllByLabelText("Amount")[0], { target: { value: "500000" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Liability" }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "liability",
          metadata: { sub_type: defaultLiabilityType ?? "mortgage" },
        }),
      ),
    );
  },
);

it("saves a picked icon on the new asset once it is made", async () => {
  render(
    <AlternativeAssetQuickAddModal
      open
      onOpenChange={() => undefined}
      defaultKind={AlternativeAssetKind.LIABILITY}
      defaultName="Loan"
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Icon" }));
  fireEvent.click(screen.getByRole("button", { name: "Use picture" }));
  fireEvent.change(screen.getAllByLabelText("Amount")[0], { target: { value: "500000" } });
  fireEvent.click(screen.getByRole("button", { name: "Add Liability" }));
  await waitFor(() =>
    expect(setLogo).toHaveBeenCalledWith({ assetId: "created", dataBase64: "PNG" }),
  );
});

it("saves no icon when none was picked", async () => {
  render(
    <AlternativeAssetQuickAddModal
      open
      onOpenChange={() => undefined}
      defaultKind={AlternativeAssetKind.LIABILITY}
      defaultName="Loan"
    />,
  );
  fireEvent.change((await screen.findAllByLabelText("Amount"))[0], { target: { value: "500000" } });
  fireEvent.click(screen.getByRole("button", { name: "Add Liability" }));
  await waitFor(() => expect(create).toHaveBeenCalled());
  expect(setLogo).not.toHaveBeenCalled();
});
