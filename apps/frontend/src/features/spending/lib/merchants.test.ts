import { describe, expect, it } from "vitest";
import { merchantFor, type Merchant } from "@/features/spending/lib/merchants";
const mk = (name: string, pattern: string): Merchant => ({ id: name, name, pattern, logoUrl: "" });
const list = [mk("UPS", "UPS"), mk("BP", "BP"), mk("Costco", "Costco"), mk("Costco Gas", "Costco Gas"), mk("Quang", "Friend (Quang Vo)")];
describe("merchantFor", () => {
  it("short words match whole words only", () => {
    expect(merchantFor("Cups Coffee", list)).toBeNull();
    expect(merchantFor("UPS STORE 1234", list)?.name).toBe("UPS");
    expect(merchantFor("BP#12345 CHICAGO", list)?.name).toBe("BP");
  });
  it("longer words are contained, longest wins", () => {
    expect(merchantFor("COSTCO WHSE #339", list)?.name).toBe("Costco");
    expect(merchantFor("Costco Gas", list)?.name).toBe("Costco Gas");
    expect(merchantFor("Friend (Quang Vo): Zelle payment from QUANG VAN VO", list)?.name).toBe("Quang");
  });
});
