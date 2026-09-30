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
  it("any of a merchant's words shows it", () => {
    const xanh: Merchant = { id: "x", name: "Xanh SM", pattern: "Green Sm", patterns: ["Green Sm", "Xanhsm"], logoUrl: "" };
    expect(merchantFor("Xanhsm Gsm Ha", [xanh])?.name).toBe("Xanh SM");
    expect(merchantFor("Green Sm Hanoi", [xanh])?.name).toBe("Xanh SM");
    expect(merchantFor("Grab", [xanh])).toBeNull();
  });
  it("longer words are contained, longest wins", () => {
    expect(merchantFor("COSTCO WHSE #339", list)?.name).toBe("Costco");
    expect(merchantFor("Costco Gas", list)?.name).toBe("Costco Gas");
    expect(merchantFor("Friend (Quang Vo): Zelle payment from QUANG VAN VO", list)?.name).toBe("Quang");
  });
  it("a merchant with the bank's logo shows the bank of each transaction's account", () => {
    const chase = { id: "c", name: "Chase Checking ••8237", group: "Chase", accountType: "CASH", meta: JSON.stringify({ source: "plaid", logoUrl: "https://x/chase.webp" }) };
    const strata = { id: "s", name: "Strata Elite", group: "Citibank", accountType: "CREDIT_CARD", meta: JSON.stringify({ source: "plaid", logoUrl: "https://x/citi.webp" }) };
    const owly = { id: "o", name: "Owed to me", group: "Owly", meta: JSON.stringify({ source: "owly", logoUrl: "https://x/owly.png" }) };
    const atm: Merchant = { id: "atm", name: "ATM", pattern: "ATM", logoUrl: null, useBank: true };
    const fees: Merchant = { id: "f", name: "Bank fees & credits", pattern: "Membership fee", patterns: ["Membership fee", "Travel credit"], logoUrl: null, useBank: true };
    const all = [...list, atm, fees];
    const hit = merchantFor("ATM WITHDRAWAL 004521 09/2913 W PE", all, chase, "WITHDRAWAL");
    expect([hit?.name, hit?.logoUrl, hit?.source, hit?.from?.id]).toEqual(["Chase", "https://x/chase.webp", "bank", "atm"]);
    expect(merchantFor("MEMBERSHIP FEE SEP 26-AUG 27", all, strata, "WITHDRAWAL")?.name).toBe("Citibank");
    expect(merchantFor("TRAVEL CREDIT $300/YEAR", all, strata, "CREDIT")?.logoUrl).toBe("https://x/citi.webp");
    expect(merchantFor("BATMAN TOYS", all, chase, "WITHDRAWAL")).toBeNull();                  // a whole word only
    expect(merchantFor("NGA NGUYEN: ATM CASH", all, owly, "CREDIT")).toBeNull();                // not a bank account
    expect(merchantFor("ATM WITHDRAWAL", all)).toBeNull();                                     // no account known
    expect(merchantFor("COSTCO WHSE #339", all, chase, "WITHDRAWAL")?.name).toBe("Costco");   // pictures as usual
  });
  it("interest shows the bank, earned or charged", () => {
    const fid = { id: "f", name: "Fidelity CASH", group: "Fidelity", accountType: "CASH", meta: JSON.stringify({ source: "plaid", logoUrl: "https://x/fid.webp" }) };
    const hit = merchantFor("FIDELITY GOVERNMENT MONEY MARKET - DIVIDEND", list, fid, "INTEREST");
    expect([hit?.name, hit?.pattern, hit?.from]).toEqual(["Fidelity", "Interest", undefined]);
  });
  it("a payment arriving on a credit card shows the card's bank; the paying side is the merchants'", () => {
    const citiCard = { id: "s", name: "Strata Elite", group: "Citibank", accountType: "CREDIT_CARD", meta: JSON.stringify({ source: "plaid", logoUrl: "https://x/citi.webp" }) };
    const checking = { id: "c", name: "Chase Checking", group: "Chase", accountType: "CASH", meta: JSON.stringify({ source: "plaid", logoUrl: "https://x/chase.webp" }) };
    const paid = merchantFor("ONLINE PAYMENT, THANK YOU", list, citiCard, "TRANSFER_IN");
    expect([paid?.name, paid?.pattern, paid?.logoUrl]).toEqual(["Citibank", "Card payment", "https://x/citi.webp"]);
    expect(merchantFor("Costco refund", list, citiCard, "CREDIT")?.name).toBe("Costco");                 // a refund is not a payment
    expect(merchantFor("COSTCO WHSE #339", list, citiCard, "WITHDRAWAL")?.name).toBe("Costco");          // purchases as usual
    expect(merchantFor("Transfer from savings", list, checking, "TRANSFER_IN")).toBeNull();              // not a card
    const chase = mk("Chase", "Chase Bank");
    chase.patterns = ["Chase Bank", "Chase card", "Chase credit"];
    expect(merchantFor("Payment to Chase card ending in 5257 09/28", [chase], checking, "TRANSFER_OUT")?.name).toBe("Chase");
  });
});
