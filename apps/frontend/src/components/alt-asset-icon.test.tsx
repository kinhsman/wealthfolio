import { render, screen } from "@/test/render";
import { afterEach, describe, expect, it } from "vitest";

import { assetLogoRegistry } from "@/lib/asset-logo-registry";
import { AltAssetIcon } from "./alt-asset-icon";

const PNG = "data:image/png;base64,AAAA";

function haveLogo(assetId: string, displayCode: string, sha256 = `sha-${assetId}`) {
  assetLogoRegistry.setIndex([{ assetId, displayCode, sha256, updatedAt: "2026-10-03T00:00:00Z" }]);
  assetLogoRegistry.prime(sha256, PNG);
}

describe("AltAssetIcon", () => {
  afterEach(() => assetLogoRegistry.reset());

  it("draws the kind without a picture", () => {
    const { container } = render(<AltAssetIcon assetId="home" kind="property" name="Home" />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("[data-slot=avatar], img")).toBeNull();
  });

  it("shows the owner's picture for that asset", () => {
    haveLogo("home", "Rental");
    render(<AltAssetIcon assetId="home" kind="property" name="Home" />);
    expect(screen.getByTitle("Home")).toBeInTheDocument();
  });

  it("finds the picture by id only, never by the shared type name", () => {
    // Both mortgages are "Mortgage": the first one's picture must not show on the second.
    haveLogo("mortgage-1", "Mortgage");
    const { container } = render(
      <AltAssetIcon assetId="mortgage-2" kind="liability" name="Other" />,
    );
    expect(screen.queryByTitle("Other")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("uses the given fallback when there is no picture", () => {
    render(<AltAssetIcon assetId="loan" kind="liability" fallback={<span>tile</span>} />);
    expect(screen.getByText("tile")).toBeInTheDocument();
  });

  it("shows a not yet saved picture before the saved one", () => {
    haveLogo("home", "Rental");
    render(<AltAssetIcon assetId="home" name="Home" src="data:image/png;base64,BBBB" />);
    expect(screen.getByTitle("Home")).toBeInTheDocument();
  });
});
