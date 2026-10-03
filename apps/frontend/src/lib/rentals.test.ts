import { afterEach, describe, expect, it } from "vitest";
import {
  clearAddonRegistrations,
  getDynamicNavItems,
  getDynamicRoutes,
  registerAddonNavItem,
  registerAddonRoute,
} from "@/addons/addons-runtime-context";
import type { AlternativeAssetHolding } from "@/lib/types";
import { isRentalProperty, rentalHref, rentalSwitchMetadata } from "./rentals";

const property = (metadata: Record<string, unknown>, kind = "property") =>
  ({ id: "p1", kind, name: "Home", metadata }) as unknown as AlternativeAssetHolding;

describe("Rental switch", () => {
  it("is on only for a property whose type is Rental Property", () => {
    expect(isRentalProperty(property({ sub_type: "rental" }))).toBe(true);
    expect(isRentalProperty(property({ sub_type: "residence" }))).toBe(false);
    expect(isRentalProperty(property({}))).toBe(false);
    expect(isRentalProperty(property({ sub_type: "rental" }, "vehicle"))).toBe(false);
  });

  it("remembers the type it replaces and puts it back when turned off", () => {
    expect(rentalSwitchMetadata(property({ sub_type: "commercial" }), true)).toEqual({
      sub_type: "rental",
      sub_type_before_rental: "commercial",
    });
    expect(
      rentalSwitchMetadata(
        property({ sub_type: "rental", sub_type_before_rental: "commercial" }),
        false,
      ),
    ).toEqual({ sub_type: "commercial", sub_type_before_rental: "" });
  });

  it("turns a property with no type into a residence when switched off", () => {
    expect(rentalSwitchMetadata(property({}), true)).toEqual({
      sub_type: "rental",
      sub_type_before_rental: "",
    });
    expect(rentalSwitchMetadata(property({ sub_type: "rental" }), false)).toEqual({
      sub_type: "residence",
      sub_type_before_rental: "",
    });
  });

  it("links to a rental and its section on /rentals", () => {
    expect(rentalHref()).toBe("/rentals");
    expect(rentalHref("abc")).toBe("/rentals?rental=abc");
    expect(rentalHref("abc", "settings")).toBe("/rentals?rental=abc&tab=settings");
  });
});

describe("Rentals address", () => {
  afterEach(() => clearAddonRegistrations("rental-tracker"));

  it("serves the rental add-on's page and sidebar link at /rentals", () => {
    registerAddonNavItem("rental-tracker", {
      id: "rental-tracker",
      label: "Rentals",
      route: "/addons/rental-tracker",
    });
    registerAddonRoute("rental-tracker", {
      path: "/addons/rental-tracker",
      routeId: "rental-tracker",
    });

    const route = getDynamicRoutes().find((r) => r.addonId === "rental-tracker");
    expect(route).toMatchObject({ href: "/rentals", path: "rentals" });
    const link = getDynamicNavItems().find((i) => i.addonId === "rental-tracker");
    expect(link?.href).toBe("/rentals");
  });
});
