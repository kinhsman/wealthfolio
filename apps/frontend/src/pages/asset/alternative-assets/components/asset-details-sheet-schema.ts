import * as z from "zod";
import { AlternativeAssetKind } from "@/lib/types";
import { parseLocalDate } from "@/lib/utils";

// Property types
export const PROPERTY_TYPES = [
  { value: "residence", label: "Residence" },
  { value: "rental", label: "Rental Property" },
  { value: "land", label: "Land" },
  { value: "commercial", label: "Commercial" },
] as const;

// Collectible types
export const COLLECTIBLE_TYPES = [
  { value: "art", label: "Art" },
  { value: "wine", label: "Wine" },
  { value: "watch", label: "Watch" },
  { value: "jewelry", label: "Jewelry" },
  { value: "memorabilia", label: "Memorabilia" },
] as const;

// Metal types (re-exported for convenience)
export const METAL_TYPES = [
  { value: "gold", label: "Gold" },
  { value: "silver", label: "Silver" },
  { value: "platinum", label: "Platinum" },
  { value: "palladium", label: "Palladium" },
] as const;

// Weight units (re-exported for convenience)
export const WEIGHT_UNITS = [
  { value: "oz", label: "Troy Ounce (oz)" },
  { value: "g", label: "Gram (g)" },
  { value: "kg", label: "Kilogram (kg)" },
] as const;

// Liability types (re-exported for convenience)
export const LIABILITY_TYPES = [
  { value: "mortgage", label: "Mortgage" },
  { value: "auto_loan", label: "Auto Loan" },
  { value: "student_loan", label: "Student Loan" },
  { value: "credit_card", label: "Credit Card" },
  { value: "personal_loan", label: "Personal Loan" },
  { value: "heloc", label: "HELOC" },
] as const;

// Vehicle types (optional, for future use)
export const VEHICLE_TYPES = [
  { value: "car", label: "Car" },
  { value: "motorcycle", label: "Motorcycle" },
  { value: "boat", label: "Boat" },
  { value: "rv", label: "RV" },
] as const;

// Base schema for common fields across all asset types
const baseSchema = z.object({
  // Name field (required, editable)
  name: z.string().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  // Common fields for all types
  purchasePrice: z.coerce
    .number()
    .positive("Purchase price must be greater than 0")
    .optional()
    .nullable(),
  purchaseDate: z.date().optional().nullable(),
  notes: z.string().max(1000, "Notes must be less than 1000 characters").optional().nullable(),
});

// Property-specific schema
export const propertyDetailsSchema = baseSchema.extend({
  kind: z.literal(AlternativeAssetKind.PROPERTY),
  address: z.string().max(200, "Address must be less than 200 characters").optional().nullable(),
  propertyType: z.enum(["residence", "rental", "land", "commercial"]).optional().nullable(),
});

// Vehicle-specific schema
export const vehicleDetailsSchema = baseSchema.extend({
  kind: z.literal(AlternativeAssetKind.VEHICLE),
  vehicleType: z.enum(["car", "motorcycle", "boat", "rv"]).optional().nullable(),
  description: z
    .string()
    .max(200, "Description must be less than 200 characters")
    .optional()
    .nullable(),
});

// Collectible-specific schema
export const collectibleDetailsSchema = baseSchema.extend({
  kind: z.literal(AlternativeAssetKind.COLLECTIBLE),
  collectibleType: z.enum(["art", "wine", "watch", "jewelry", "memorabilia"]).optional().nullable(),
  description: z
    .string()
    .max(200, "Description must be less than 200 characters")
    .optional()
    .nullable(),
});

// Precious metal-specific schema
export const preciousMetalDetailsSchema = baseSchema.extend({
  kind: z.literal(AlternativeAssetKind.PRECIOUS_METAL),
  metalType: z.enum(["gold", "silver", "platinum", "palladium"]).optional().nullable(),
  quantity: z.coerce.number().positive("Quantity must be greater than 0").optional().nullable(),
  unit: z.enum(["oz", "g", "kg"]).optional().nullable(),
  description: z
    .string()
    .max(200, "Description must be less than 200 characters")
    .optional()
    .nullable(),
});

// Liability-specific schema
export const liabilityDetailsSchema = baseSchema.extend({
  kind: z.literal(AlternativeAssetKind.LIABILITY),
  liabilityType: z
    .enum(["mortgage", "auto_loan", "student_loan", "credit_card", "personal_loan", "heloc"])
    .optional()
    .nullable(),
  originalAmount: z.coerce
    .number()
    .positive("Original amount must be greater than 0")
    .optional()
    .nullable(),
  originationDate: z.date().optional().nullable(),
  interestRate: z.coerce
    .number()
    .min(0, "Interest rate must be 0 or greater")
    .max(100, "Interest rate must be 100 or less")
    .optional()
    .nullable(),
  linkedAssetId: z.string().optional().nullable(),
  // money-hub: the loan's term and how it is paid back, for its schedule (owner, 10-03: a loan in
  // Vietnam, "track the loan amount term and the interest rate"); the money-hub service steps the
  // balance down each payment day when followSchedule is on (lib/loans.js).
  termMonths: z.coerce
    .number()
    .int("Whole months")
    .positive("The term must be at least 1 month")
    .max(600, "The term must be 50 years or less")
    .optional()
    .nullable(),
  repayment: z.enum(["annuity", "equal_principal", "interest_only"]).optional().nullable(),
  /** The day the loan must be paid back (a Vietnamese bank's "ngày đáo hạn"): payments fall on its day. */
  maturityDate: z.date().optional().nullable(),
  /** Renewing a line costs this percent of its amount, due when its term ends (owner, 10-03). */
  renewalFeePct: z.coerce.number().min(0, "0 or more").max(100, "100 or less").optional().nullable(),
  /** The day of the month the payment is made (owner, 10-03: the loan's, the same for all its lines). */
  paymentDay: z.coerce.number().int("A day of the month").min(1, "1 to 31").max(31, "1 to 31").optional().nullable(),
  /** One loan drawn in lines (owner, 10-03: split by the bank's limit per line): each line's number,
   *  amount and the day its term ends, to renew it in time. Lines with no amount are left out on save. */
  lines: z
    .array(
      z.object({
        id: z.string(),
        number: z.string().max(40).optional().nullable(),
        amount: z.coerce.number().min(0),
        end: z.date().optional().nullable(),
      }),
    )
    .optional()
    .nullable(),
  followSchedule: z.boolean().optional().nullable(),
  autoBills: z.boolean().optional().nullable(),
});

// Other asset schema (generic)
export const otherDetailsSchema = baseSchema.extend({
  kind: z.literal(AlternativeAssetKind.OTHER),
  description: z
    .string()
    .max(200, "Description must be less than 200 characters")
    .optional()
    .nullable(),
});

// Discriminated union of all asset type schemas
export const assetDetailsSchema = z.discriminatedUnion("kind", [
  propertyDetailsSchema,
  vehicleDetailsSchema,
  collectibleDetailsSchema,
  preciousMetalDetailsSchema,
  liabilityDetailsSchema,
  otherDetailsSchema,
]);

// Type for the combined form values
export type AssetDetailsFormValues = z.infer<typeof assetDetailsSchema>;

// Type-specific form value types for convenience
export type PropertyDetailsFormValues = z.infer<typeof propertyDetailsSchema>;
export type VehicleDetailsFormValues = z.infer<typeof vehicleDetailsSchema>;
export type CollectibleDetailsFormValues = z.infer<typeof collectibleDetailsSchema>;
export type PreciousMetalDetailsFormValues = z.infer<typeof preciousMetalDetailsSchema>;
export type LiabilityDetailsFormValues = z.infer<typeof liabilityDetailsSchema>;
export type OtherDetailsFormValues = z.infer<typeof otherDetailsSchema>;

// Helper function to get default form values based on asset kind and existing metadata
export function getDefaultDetailsFormValues(
  kind: AlternativeAssetKind,
  name: string,
  metadata?: Record<string, unknown>,
  notes?: string | null,
): AssetDetailsFormValues {
  const base = {
    name,
    purchasePrice: metadata?.purchase_price ? parseFloat(metadata.purchase_price as string) : null,
    purchaseDate: metadata?.purchase_date ? parseLocalDate(metadata.purchase_date as string) : null,
    notes: notes ?? null,
  };

  // Read sub_type from metadata (unified field for all asset types)
  const subType = (metadata?.sub_type as string) ?? null;

  switch (kind) {
    case AlternativeAssetKind.PROPERTY:
      return {
        ...base,
        kind: AlternativeAssetKind.PROPERTY,
        address: (metadata?.address as string) ?? null,
        propertyType: subType as PropertyDetailsFormValues["propertyType"],
      };

    case AlternativeAssetKind.VEHICLE:
      return {
        ...base,
        kind: AlternativeAssetKind.VEHICLE,
        vehicleType: subType as VehicleDetailsFormValues["vehicleType"],
        description: (metadata?.description as string) ?? null,
      };

    case AlternativeAssetKind.COLLECTIBLE:
      return {
        ...base,
        kind: AlternativeAssetKind.COLLECTIBLE,
        collectibleType: subType as CollectibleDetailsFormValues["collectibleType"],
        description: (metadata?.description as string) ?? null,
      };

    case AlternativeAssetKind.PRECIOUS_METAL:
      return {
        ...base,
        purchasePrice: metadata?.purchase_price_per_unit
          ? parseFloat(metadata.purchase_price_per_unit as string)
          : null,
        kind: AlternativeAssetKind.PRECIOUS_METAL,
        metalType: subType as PreciousMetalDetailsFormValues["metalType"],
        quantity: metadata?.quantity ? parseFloat(metadata.quantity as string) : null,
        unit: (metadata?.unit as PreciousMetalDetailsFormValues["unit"]) ?? null,
        description: (metadata?.description as string) ?? null,
      };

    case AlternativeAssetKind.LIABILITY:
      // For original amount, check both new field (original_amount) and legacy field (purchase_price)
      const origAmount = metadata?.original_amount ?? metadata?.purchase_price;
      // For origination date, check both new field (origination_date) and legacy field (purchase_date)
      const origDate = metadata?.origination_date ?? metadata?.purchase_date;
      return {
        ...base,
        kind: AlternativeAssetKind.LIABILITY,
        liabilityType: subType as LiabilityDetailsFormValues["liabilityType"],
        originalAmount: origAmount ? parseFloat(origAmount as string) : null,
        originationDate: origDate ? parseLocalDate(origDate as string) : null,
        interestRate: metadata?.interest_rate ? parseFloat(metadata.interest_rate as string) : null,
        linkedAssetId: (metadata?.linked_asset_id as string) ?? null,
        termMonths: metadata?.term_months ? parseInt(metadata.term_months as string, 10) : null,
        repayment:
          metadata?.repayment === "equal_principal" || metadata?.repayment === "interest_only"
            ? metadata.repayment
            : "annuity",
        followSchedule: metadata?.follow_schedule === "true",
        autoBills: metadata?.auto_bills === "true",
        maturityDate: metadata?.maturity_date ? parseLocalDate(metadata.maturity_date as string) : null,
        paymentDay: metadata?.payment_day ? parseInt(metadata.payment_day as string, 10) : null,
        renewalFeePct: metadata?.renewal_fee_pct ? parseFloat(metadata.renewal_fee_pct as string) : null,
        lines: linesFromMetadata(metadata?.loan_lines),
      };

    case AlternativeAssetKind.OTHER:
    default:
      return {
        ...base,
        kind: AlternativeAssetKind.OTHER,
        description: (metadata?.description as string) ?? null,
      };
  }
}

// Helper function to convert form values to metadata for API
export function formValuesToMetadata(values: AssetDetailsFormValues): Record<string, string> {
  const metadata: Record<string, string> = {};

  // Common fields
  if (values.purchasePrice != null) {
    // For precious metals, use purchase_price_per_unit
    if (values.kind === AlternativeAssetKind.PRECIOUS_METAL) {
      metadata.purchase_price_per_unit = values.purchasePrice.toString();
    } else {
      metadata.purchase_price = values.purchasePrice.toString();
    }
  }

  if (values.purchaseDate) {
    metadata.purchase_date = formatDateToISO(values.purchaseDate);
  }

  // Notes are NOT stored in metadata - they go in asset.notes field

  // Type-specific fields (all use unified 'sub_type' for the type field)
  switch (values.kind) {
    case AlternativeAssetKind.PROPERTY:
      if (values.address) metadata.address = values.address;
      if (values.propertyType) metadata.sub_type = values.propertyType;
      break;

    case AlternativeAssetKind.VEHICLE:
      if (values.vehicleType) metadata.sub_type = values.vehicleType;
      if (values.description) metadata.description = values.description;
      break;

    case AlternativeAssetKind.COLLECTIBLE:
      if (values.collectibleType) metadata.sub_type = values.collectibleType;
      if (values.description) metadata.description = values.description;
      break;

    case AlternativeAssetKind.PRECIOUS_METAL:
      if (values.metalType) metadata.sub_type = values.metalType;
      if (values.quantity != null) metadata.quantity = values.quantity.toString();
      if (values.unit) metadata.unit = values.unit;
      if (values.description) metadata.description = values.description;
      break;

    case AlternativeAssetKind.LIABILITY:
      if (values.liabilityType) metadata.sub_type = values.liabilityType;
      if (values.originalAmount != null)
        metadata.original_amount = values.originalAmount.toString();
      if (values.originationDate)
        metadata.origination_date = formatDateToISO(values.originationDate);
      if (values.interestRate != null) metadata.interest_rate = values.interestRate.toString();
      if (values.linkedAssetId) metadata.linked_asset_id = values.linkedAssetId;
      // Always sent, so clearing the term or turning the schedule off sticks (the server merges keys).
      metadata.term_months = values.termMonths != null ? values.termMonths.toString() : "";
      metadata.repayment = values.repayment ?? "annuity";
      metadata.follow_schedule = values.followSchedule ? "true" : "false";
      metadata.auto_bills = values.autoBills ? "true" : "false";
      metadata.maturity_date = values.maturityDate ? formatDateToISO(values.maturityDate) : "";
      metadata.payment_day = values.paymentDay != null ? values.paymentDay.toString() : "";
      metadata.renewal_fee_pct = values.renewalFeePct != null ? values.renewalFeePct.toString() : "";
      metadata.loan_lines = linesToMetadata(values.lines);
      break;

    case AlternativeAssetKind.OTHER:
      if (values.description) metadata.description = values.description;
      break;
  }

  return metadata;
}

// money-hub: a loan's lines, kept as JSON in its metadata (the money-hub service reads them too).
export type LoanLineForm = { id: string; number?: string | null; amount: number; end?: Date | null };

export function linesFromMetadata(raw: unknown): LoanLineForm[] {
  try {
    const list = JSON.parse(typeof raw === "string" && raw ? raw : "[]") as { id?: string; number?: string; amount?: number | string; end?: string | null }[];
    return (Array.isArray(list) ? list : []).map((x, i) => ({
      id: String(x.id ?? i),
      number: x.number ?? "",
      amount: Number(x.amount) || 0,
      end: x.end ? parseLocalDate(x.end) : null,
    }));
  } catch {
    return [];
  }
}

/** The lines with an amount, as saved; "" when there are none (so removing the last one sticks). */
export function linesToMetadata(lines: LoanLineForm[] | null | undefined): string {
  const kept = (lines ?? []).filter((l) => Number(l.amount) > 0);
  if (!kept.length) return "";
  return JSON.stringify(
    kept.map((l) => ({ id: l.id, number: (l.number ?? "").trim(), amount: Number(l.amount), end: l.end ? formatDateToISO(l.end) : null })),
  );
}

// Helper to format date to ISO string (YYYY-MM-DD)
function formatDateToISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
