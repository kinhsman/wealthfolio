import { describe, expect, it } from "vitest";

import { cleanPayee } from "./payee-name";

// Real bank lines from the owner's last year of transactions (10-17), names kept as the bank sent them.
const cases: [string, string][] = [
  // Pay and transfers between the owner's own accounts.
  ["CISCO SYSTEMS IN PAYROLL PPD ID: 9111111101", "Cisco Systems payroll"],
  ["DIRECT DEPOSIT CISCO SYSTEMPAYROLL (Cash)", "Cisco Systems payroll"],
  ["ACH Electronic Credit CISCO SYSTEMS IN PAYROLL", "Cisco Systems payroll"],
  ["DIRECT DEPOSIT CISCO T&E EDI PAYMNT (Cash)", "Cisco expense refund"],
  ["DIRECT DEPOSIT JPMorgan ChaExt Trnsfr (Cash)", "Transfer from Chase"],
  ["DIRECT DEPOSIT SCHWAB BROKEMONEYLINK (Cash)", "Transfer from Schwab"],
  ["DIRECT DEPOSIT APPLE GS SAVTRAN 910120603316 WEB (Cash)", "Transfer from Apple Savings"],
  ["DIRECT DEBIT JPMorgan ChaseACCTVERIFY (Cash)", "Chase account check"],
  ["DIRECT DEBIT US BANK HOME MMTG PYMT (Cash)", "US Bank mortgage"],
  ["TRANSFERRED FROM VS Z35-689954-1 (Cash)", "Transfer from account ••9541"],
  // Card payments.
  ["Payment to Chase card ending in 5257 10/22", "Chase card payment ••5257"],
  ["CITI CARD ONLINE PAYMENT 432117754837820 WEB ID: CITICTP", "Citi card payment"],
  ["CAPITAL ONE MOBILE PMT CA0C5794FCDBC31 WEB ID: 9279744380", "Capital One card payment"],
  ["DIRECT DEBIT CHASE CREDIT CEPAY (Cash)", "Chase card payment"],
  ["ONLINE PAYMENT, THANK YOU", "Payment received"],
  ["Payment Thank You - Web", "Payment received"],
  ["Payment Thank You-Mobile", "Payment received"],
  // Zelle, with and without the owner's own label in front.
  ["Zelle payment from MATTHEW ANGEL BACdvpb487nl", "Zelle from Matthew Angel"],
  ["Zelle payment to ROLANDO GUTIERREZ-CAMARGO 30133781570", "Zelle to Rolando Gutierrez-Camargo"],
  ["Friend (Thành): Zelle payment from Marcus Nguyen COFREPPNUMIO", "Friend (Thành): Zelle from Marcus Nguyen"],
  ["Rent received: Zelle payment from FELICIA CRUZ 31051466495", "Rent received: Zelle from Felicia Cruz"],
  ["Mortgage paid (on the Rental page): DIRECT DEBIT US BANK HOME MMTG PYMT (Cash)", "Mortgage paid"],
  // Wires.
  [
    "BOOK TRANSFER CREDIT B/O: ASIA COMMERCIAL JOINT STOCK BANK HO CHI MINH CITY VIETNAM VN ORG:/48601447 1/LAM THI THANH NGA",
    "Wire from Lam Thi Thanh Nga",
  ],
  ["CHIPS CREDIT VIA: MASHREQBANK PSC., NEW YORK BRANCH/0174 B/O: LAM THI HIEN DOB 10/01/1985", "Wire from Lam Thi Hien"],
  [
    "DOMESTIC WIRE TRANSFER A/C: NATIONAL FINANCIAL SERVICES LLC SMITHFIELD RI 02917- US REF:/BNF/FBO SANG",
    "Wire to National Financial Services",
  ],
  ["INTERNATIONAL INCOMING WIRE FEE", "International incoming wire fee"],
  // Card purchases, US and Vietnam.
  ["DEBIT CARD PURCHASE TMOBILE*AUTO PAY 800-937-8997 WA 092126 AUTHID:561579 (Cash)", "T-Mobile"],
  ["DEBIT CARD PURCHASE ELIM WIG & BEAUTY SUPP CHICAGO IL 060926 AUTHID:345626 (Cash)", "Elim Wig & Beauty Supp"],
  ["DEBIT CARD PURCHASE TARGET T-2373 Chicago IL 060926 AUTHID:513116 (Cash)", "Target"],
  ["CASH ADVANCE Viet Taste Pho A NORRIDGE IL 052926 AUTHID:640039 (Cash)", "Cash advance, Viet Taste Pho A"],
  ["CASH ADVANCE 4145 W PETERSON AVE CHICAGO IL 071426 AUTHID:261696 (Cash)", "Cash advance"],
  ["WCM_DNG_WMP_2B02 DA NANG VNM", "WinMart"],
  ["Grab* A-8LOLQQQWWLLGAV HA NOI VNM", "Grab"],
  ["MPOS*SOPHIEHUE", "Sophiehue"],
  ["EVA AIR669552463217870 HO CHI MINH C VNMNAME: EVAAIRPNAME DEPART:09/19/2026", "EVA Air"],
  // Vietnamese email banks.
  ["LAM THANH SANG CHUYEN KHOAN-151026-07:17:32 6288ASCB02GALSFD .", "Bank transfer, Lam Thanh Sang"],
  ["LAM THANH SANG chuyen tien (LAM THANH SANG - 48438917)", "Bank transfer, Lam Thanh Sang"],
  ["IB NAP TIEN DIEN THOAI DI DONG TRA TRUOC CHO 0865285079 .", "Phone top-up"],
  ["PHI GIA HAN", "Renewal fee"],
  // Card perks and the like read as a sentence.
  ["HOTEL CREDIT $250/YEAR", "Hotel credit $250/year"],
  ["CITIBANK CONDITIONAL CREDIT FOR DISPUTE", "Citibank conditional credit for dispute"],
  ["UPTOWN PIZZA & BARBEQUE", "Uptown Pizza & Barbeque"],
  ["Transfer to Bankcard 02/07 07:52a #0465 ONLINE Reference # 000302", "Transfer to Bankcard"],
];

describe("cleanPayee", () => {
  it.each(cases)("%s", (raw, shown) => {
    expect(cleanPayee(raw)).toBe(shown);
  });

  it("leaves a name the owner typed, or a short brand, as it is", () => {
    for (const name of ["Costco", "Quang Vo: Illenium tickets (taken off)", "Jack Vu paid back: Settled in full", "CVS", "IHOP", "AT&T", "Mott 32"]) {
      expect(cleanPayee(name)).toBe(name);
    }
  });

  it("drops only the (Cash) tag from an otherwise plain name", () => {
    expect(cleanPayee("Nga Nguyen paid back (Cash)")).toBe("Nga Nguyen paid back");
  });

  it("never comes back empty", () => {
    expect(cleanPayee("")).toBe("");
    expect(cleanPayee(null)).toBe("");
    expect(cleanPayee("123456789")).toBe("123456789");
  });
});
