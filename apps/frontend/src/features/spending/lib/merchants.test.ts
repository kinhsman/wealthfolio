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
  it("lets a merchant with its own picture win over a bank's-logo one", () => {
    const chase = { id: "c", name: "Chase Checking", group: "Chase", accountType: "CASH", meta: JSON.stringify({ source: "plaid", logoUrl: "https://x/chase.webp" }) };
    const atm: Merchant = { id: "atm", name: "ATM", pattern: "ATM WITHDRAWAL CASH", logoUrl: null, useBank: true };
    const shop: Merchant = { id: "7e", name: "7-Eleven", pattern: "7-ELEVEN", logoUrl: "https://x/711.png" };
    expect(merchantFor("ATM WITHDRAWAL CASH 7-ELEVEN 1234", [atm, shop], chase)?.name).toBe("7-Eleven");
    expect(merchantFor("ATM WITHDRAWAL CASH 1234", [atm, shop], chase)?.source).toBe("bank");
  });
});

describe("merchantFor on a bank read from its emails", () => {
  const acb = { id: "a", name: "ACB", group: "ACB", accountType: "CASH", meta: JSON.stringify({ source: "email", logoUrl: "https://x/acb.png" }) };
  const chase = { id: "c", name: "Chase Checking", group: "Chase", accountType: "CASH", meta: JSON.stringify({ source: "plaid", logoUrl: "https://x/chase.webp" }) };
  const shop: Merchant = { id: "h", name: "Highlands", pattern: "HIGHLANDS", logoUrl: "https://x/h.png" };
  const own: Merchant = { id: "o", name: "Own transfers", pattern: "CHUYEN TIEN", logoUrl: null, useBank: true };
  it("shows the bank when no merchant matches, a merchant when one does", () => {
    const hit = merchantFor("FAMILY-031026-10:03:04 6276ASCB02EQFHSU .", [shop], acb, "WITHDRAWAL");
    expect([hit?.name, hit?.logoUrl, hit?.source, hit?.fallback]).toEqual(["ACB", "https://x/acb.png", "bank", true]);
    expect(merchantFor("THANH TOAN HIGHLANDS COFFEE", [shop], acb, "WITHDRAWAL")?.name).toBe("Highlands");
    expect(merchantFor("FAMILY-031026", undefined, acb, "WITHDRAWAL")).toBeNull();      // merchants not loaded yet
    expect(merchantFor("Foremost Liquor Center", [shop], chase, "WITHDRAWAL")).toBeNull(); // Plaid banks as before
  });
  it("lets a merchant with the bank's logo show it", () => {
    const hit = merchantFor("LAM THANH SANG CHUYEN TIEN GD 6276MSCBD2PGWQKG", [own], acb, "TRANSFER_IN");
    expect([hit?.name, hit?.from?.id, hit?.fallback]).toEqual(["ACB", "o", undefined]);
  });
});

describe("merchantFor with the bank's words", () => {
  const water = { id: "w", name: "Water", pattern: "WATER BILL", logoUrl: "x" } as Merchant;
  const city = { id: "c", name: "City", pattern: "CITY OF CHICAGO", logoUrl: "y" } as Merchant;
  it("uses the bank's words only when the payee matches none", () => {
    const bank = "CITY OF CHICAGO WATER BILL 1364743-375285 WEB ID: 1366005820";
    expect(merchantFor("City Of Chicago", [water, city], null, "WITHDRAWAL", bank)?.id).toBe("c");
    expect(merchantFor("City Of Chicago", [water], null, "WITHDRAWAL", bank)?.id).toBe("w");
    expect(merchantFor("City Of Chicago", [water], null, "WITHDRAWAL", null)).toBeNull();
  });
});
