// money-hub patch (owner, 10-17: "i need the app to auto normalize without having to use rename rules"):
// the name a transaction shows when all the bank sent is its own line ("DIRECT DEPOSIT CISCO
// SYSTEMPAYROLL (Cash)", "LAM THANH SANG CHUYEN KHOAN-151026-07:17:32 6288ASCB02GALSFD ."). Display
// only: the stored payee, rules, search and the Bank description stay word for word. A name the owner
// typed (mixed case, no bank ids) is never touched; a rule's "Rename to" still wins over this.

/** Filler a bank puts in front of the payee. */
const PREFIX =
  /^(DEBIT CARD PURCHASE|DEBIT CARD RETURN|POS PURCHASE|POS DEBIT|PURCHASE AUTHORIZED ON \S+|RECURRING PAYMENT|ACH ELECTRONIC (CREDIT|DEBIT)|ACH (CREDIT|DEBIT)|ELECTRONIC (CREDIT|DEBIT)|DIRECT DEPOSIT|DIRECT DEBIT|REF)\s+/i;

/** Payment services that put the real store after the star ("SQ *JOE'S"); any other star is the store
 *  first ("TMOBILE*AUTO PAY"). */
const AGGREGATORS = /^(SQ|TST|SP|PAYPAL|PP|GRAB|ZALOPAY|MPOS|ASTRA|VNPAY|PAYOO|DD|IC|LYFT|UBER)$/i;

/** Places that end a card line, US and Vietnam. */
const PLACES =
  /\s+(TP\.?\s*)?(CHICAGO|BRIDGEVIEW|NORRIDGE|DA NANG|DANANG|DNG|DNA|HO CHI MINH( CITY| C)?|HA NOI|HANOI|HUE|QUANG NAM|KAMBAH|INTERNET)\b.*$/i;

/** Stores whose bank line is a code or cut short. Matched on the start of the cleaned line. */
const BRANDS: [RegExp, string][] = [
  [/^TMOBILE\b/i, "T-Mobile"],
  [/^APPLE\.COM/i, "Apple"],
  [/^DD\/BR\b/i, "Dunkin'"],
  [/^MCDONALDS?\b/i, "McDonald's"],
  [/^WEEE\b/i, "Weee!"],
  [/^SHEIN\b/i, "Shein"],
  [/^SPOTHERO\b/i, "SpotHero"],
  [/^METROPOLIS\b/i, "Metropolis Parking"],
  [/^EVA ?AIR/i, "EVA Air"],
  [/^WISE\b/i, "Wise"],
  [/^MOOMOO/i, "Moomoo"],
  [/^WCM\b/i, "WinMart"],
  [/^PLX\b/i, "Petrolimex"],
  [/^CCUNG\b|^CONCUNG/i, "Con Cung"],
  [/^AEON ?MALL/i, "AEON Mall"],
  [/^GRAB\b/i, "Grab"],
];

/** A company's name as an ACH line cuts it (16 letters, glued to what the payment is). */
const COMPANIES: [RegExp, string][] = [
  [/^CISCO SYSTEMS?( IN(C)?)?$/i, "Cisco Systems"],
  [/^CISCO\b/i, "Cisco"],
  [/^JP ?MORGAN( ?CH\w*)?$|^CHASE\b/i, "Chase"],
  [/^CHARLES SCHW(AB)?$/i, "Charles Schwab"],
  [/^SCHWAB/i, "Schwab"],
  [/^APPLE GS\b/i, "Apple Savings"],
  [/^MSPBNA\b/i, "Morgan Stanley"],
  [/^CITI\b/i, "Citi"],
  [/^US BANK\b/i, "US Bank"],
  [/^SOFI\b/i, "SoFi"],
  [/^VENMO\b/i, "Venmo"],
  [/^CAPITAL ONE\b/i, "Capital One"],
  [/^JP ILSOS VEH|^ILSOS\b/i, "Illinois vehicle registration"],
];

/** Card issuers, for a card payment. */
const ISSUERS: [RegExp, string][] = [
  [/CAPITAL ONE/i, "Capital One"],
  [/\bCITI/i, "Citi"],
  [/\bCHASE\b/i, "Chase"],
  [/AMEX|AMERICAN EXPRESS/i, "Amex"],
  [/DISCOVER/i, "Discover"],
  [/APPLE ?CARD|GSBANK/i, "Apple Card"],
  [/BANK OF AMERICA|BK OF AMER/i, "Bank of America"],
  [/WELLS FARGO/i, "Wells Fargo"],
];

/** Kept in capitals inside a name. */
const ACRONYMS = new Set(["ATM", "ACH", "US", "USA", "LLC", "IRS", "CVS", "BP", "SPAXX", "AEON", "EVA", "UPS", "USPS"]);

/** Words that make a line a description, not a name: such a line reads as a sentence. */
const GENERIC = new Set(
  (
    "WIRE TRANSFER TRANSFERRED TO FROM BANK FEE FEES INCOMING OUTGOING DOMESTIC INTERNATIONAL PAYMENT THANK " +
    "YOU CREDIT DEBIT CARD ONLINE ATM WITHDRAWAL DEPOSIT CASH ADVANCE MEMBERSHIP AUTH USER MEMBER INTEREST " +
    "CHARGE CHARGED ADJUST REBATE BALANCE REFUND SECURITY ITEM UNDER INVESTIGATION CONDITIONAL FOR DISPUTE " +
    "ELECTRONIC FUNDS ANNUAL OVERDRAFT SERVICE MONTHLY HOTEL TRAVEL DINING THE A OF AND AS FRAUD AUTOMATIC " +
    "PAID RECEIVED RETURN RETURNED YEAR MONTH"
  ).split(" "),
);

/** Vietnamese bank words (email banks: ACB, MB, Vietin). */
const VIET: [RegExp, string][] = [
  [/\bNAP TIEN DIEN THOAI\b/i, "Phone top-up"],
  [/\bPHI GIA HAN\b/i, "Renewal fee"],
  [/\bPHI QUAN LY\b/i, "Account fee"],
  [/\bRUT TIEN\b/i, "Cash withdrawal"],
];

const mostlyUpper = (s: string) => {
  const letters = s.replace(/[^\p{L}]/gu, "");
  return letters.length > 0 && letters.replace(/[^\p{Lu}]/gu, "").length / letters.length > 0.7;
};

/** Ids, dates, times, phone numbers and reference numbers, wherever the bank put them. */
const NOISE =
  /\d{6,}|AUTHID|\b(PPD|WEB|CO)\s+ID:|Reference #|\bREF:|\bB\/O:|\bA\/C:|Zelle payment (from|to)|card ending in \d{4}|\(Cash\)$|\d{1,2}:\d{2}|^PAYMENT,? THANK YOU/i;

const MONTHS = new Set("JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split(" "));
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

function titleWord(w: string): string {
  // "$500/YEAR" -> "$500/year", "26-AUG" -> "26-Aug"; ids and "AT&T" stay as they are.
  if (/\d/.test(w)) return w.replace(/\p{Lu}{3,}/gu, (m) => (MONTHS.has(m) ? cap(m) : m.toLowerCase()));
  if (!/\p{L}/u.test(w) || w.includes("&")) return w;
  if (ACRONYMS.has(w.toUpperCase())) return w.toUpperCase();
  if (MONTHS.has(w.toUpperCase())) return cap(w);
  return w.split("-").map(cap).join("-");
}

/** Capitals as the bank sends them, written the way a person would: "Elim Wig & Beauty Supp",
 *  "Wire transfer to bank"; a short single word ("CVS", "IHOP") is left as it is. */
function tidyCase(s: string): string {
  if (!mostlyUpper(s)) return s;
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length === 1 && words[0].replace(/[^\p{L}]/gu, "").length <= 4) return s;
  // Mostly bank words: a sentence ("Citibank conditional credit for dispute"); else a name.
  const isGeneric = (w: string) =>
    w.split("-").every((p) => GENERIC.has(p.replace(/[^\p{L}]/gu, "").toUpperCase()) || !/\p{L}/u.test(p));
  const generic = words.filter(isGeneric).length;
  if (generic / words.length >= 0.6) {
    const out = words
      .map((w) => (ACRONYMS.has(w.toUpperCase()) ? w.toUpperCase() : isGeneric(w) ? w.toLowerCase() : titleWord(w)))
      .join(" ");
    return out.charAt(0).toUpperCase() + out.slice(1);
  }
  return words.map(titleWord).join(" ");
}

const personName = (s: string) =>
  s
    .trim()
    .split(/\s+/)
    .map((w) => (mostlyUpper(w) ? w.split("-").map(cap).join("-") : w))
    .join(" ");

const issuerOf = (s: string) => ISSUERS.find(([re]) => re.test(s))?.[1] ?? null;
const companyOf = (s: string) => {
  const t = s.trim();
  return COMPANIES.find(([re]) => re.test(t))?.[1] ?? tidyCase(t);
};

/** The id a Zelle line ends with ("26643570069", "BACjf294paek", "COFREPPNUMIO"). */
const ZELLE_ID = /\s+(?:\S*\d\S{5,}|(?:BAC|JPM|COF|BMO|WFC|USB)[A-Za-z0-9]{6,})$/;

/** Short what-it-is lines the bank glues to the company in an ACH entry. */
const ACH_KIND =
  /(ACCTVERIFY|PAYROLL|CRCARDPMT|CEPAY|ONLIPAYMENT|MOBILE PMT|MONEYLINK|EXT TRNSFR|SAVTRAN|TRAN|P2P|EDI PAYMNT|MMTG PYMT|PAYMENT|ACH TRANSFER)\b/i;

function cleanBankLine(raw: string): string {
  let t = raw.replace(/\s*\(Cash\)$/i, "").replace(/\s+\.$/, "").replace(/\s+/g, " ").trim();

  // Money between people and accounts.
  const zelle = /^Zelle payment (from|to) (.+)$/i.exec(t);
  if (zelle) return `Zelle ${zelle[1].toLowerCase()} ${personName(zelle[2].replace(ZELLE_ID, ""))}`;
  const cardPay = /^Payment to (\w+) card ending in (\d{4})/i.exec(t);
  if (cardPay) return `${tidyCase(cardPay[1].toUpperCase())} card payment ••${cardPay[2]}`;
  if (/CRCARDPMT|CEPAY|ONLIPAYMENT|MOBILE PMT|CARD ONLINE PAYMENT|CR(EDIT)? CRD AUTOPAY|CARD PAYMENT/i.test(t)) {
    const issuer = issuerOf(t);
    if (issuer) return `${issuer} card payment`;
  }
  if (/^(ONLINE PAYMENT,? THANK YOU|PAYMENT,? THANK YOU|AUTOMATIC PAYMENT - THANK|AUTOPAY \S+ ?AUTO-PMT)/i.test(t))
    return "Payment received";
  if (/AUTOPAY RTN/i.test(t)) return "Autopay returned";
  const moved = /^TRANSFERRED (FROM|TO) \S+ (\S+)/i.exec(t);
  if (moved) return `Transfer ${moved[1].toLowerCase()} account ••${moved[2].replace(/\D/g, "").slice(-4)}`;

  // Wires: who sent it or where it went.
  if (/^(BOOK TRANSFER CREDIT|FEDWIRE CREDIT|CHIPS CREDIT)/i.test(t)) {
    const org = /ORG:\/\S+\s+(?:\d\/)?([A-Z][A-Z .]+?)(?=\s+(?:OGB|REF|ID|DOB)\b|:|$)/.exec(t);
    const bo = /B\/O:\s*([A-Z][A-Z .]+?)(?=\s+(?:DOB|REF|ORG|ID)\b|\s+-|:|$)/.exec(t);
    const who = (org?.[1] ?? bo?.[1] ?? "").replace(PLACES, "").trim();
    return who ? `Wire from ${personName(who)}` : "Wire in";
  }
  const wireOut = /^DOMESTIC WIRE TRANSFER A\/C:\s*(.+?)(?:\s+(LLC|INC|BANK)\b|\s+[A-Z]{2}\s+\d{5}|$)/i.exec(t);
  if (wireOut) return `Wire to ${tidyCase(`${wireOut[1]}${wireOut[2] ? ` ${wireOut[2]}` : ""}`.replace(/\s+(LLC|INC)$/i, ""))}`;

  // Pay, interest, dividends.
  const div = /DIVIDEND RECEIVED.*\(([A-Z]{3,6})\)/i.exec(t);
  if (div) return `${div[1].toUpperCase()} dividend`;
  if (/PAYROLL/i.test(t)) {
    const who = t.replace(PREFIX, "").replace(/([A-Z])PAYROLL/i, "$1 PAYROLL").split(/\s+PAYROLL/i)[0];
    return `${companyOf(who)} payroll`;
  }

  // Vietnamese bank lines.
  for (const [re, name] of VIET) if (re.test(t)) return name;
  const viet = /^(.+?)\s+(CHUYEN KHOAN|CHUYEN TIEN|CK)\b/i.exec(t);
  // The name is whoever the bank's alert names, often the owner himself on money he sent: no direction.
  if (viet) return `Bank transfer, ${personName(viet[1])}`;

  // ACH entries: the company, then what the payment is.
  if (/^(DIRECT DEPOSIT|DIRECT DEBIT|ACH)/i.test(t)) {
    const incoming = /^(DIRECT DEPOSIT|ACH ELECTRONIC CREDIT|ACH CREDIT)/i.test(t);
    const body = t.replace(PREFIX, "").replace(/\s+(WEB|PPD)\b.*$/i, "").replace(/\s+\d{6,}.*$/, "");
    const glued = body.replace(/(\S)(ACCTVERIFY|MONEYLINK|SAVTRAN|ONLIPAYMENT|CRCARDPMT|CEPAY|EXT TRNSFR|PAYMENT)\b/i, "$1 $2");
    const m = ACH_KIND.exec(glued);
    const company = companyOf(m ? glued.slice(0, m.index).trim() : glued);
    const kind = (m?.[1] ?? "").toUpperCase();
    if (kind === "ACCTVERIFY") return `${company} account check`;
    if (kind === "MMTG PYMT") return `${company} mortgage`;
    if (kind === "EDI PAYMNT") return `${company} expense refund`;
    if (kind === "PAYMENT") return `Payment ${incoming ? "from" : "to"} ${company}`;
    if (/MONEYLINK|EXT TRNSFR|SAVTRAN|^TRAN$|P2P|ACH TRANSFER/.test(kind)) {
      return `Transfer ${incoming ? "from" : "to"} ${company}`;
    }
    return company;
  }

  // Card purchases and everything else: drop the filler, then the place, ids and numbers.
  const advance = /^CASH ADVANCE\s+(.*)$/i.exec(t);
  if (advance) {
    const at = /^\d/.test(advance[1]) ? "" : cleanBankLine(advance[1]);
    return at ? `Cash advance, ${at}` : "Cash advance";
  }
  if (/^ATM WITHDRAWAL\b/i.test(t)) return "ATM withdrawal";
  t = t.replace(PREFIX, "");
  const star = /^([^*\s]+)\s?\*\s?(.*)$/.exec(t);
  // After the star an id ("Grab* A-8LOLQQQWWLLGAV") is not a store: keep the service's name.
  if (star) {
    const after = star[2].trim().split(/\s+/)[0] ?? "";
    const idLike = /\d/.test(after) && after.length >= 8;
    t = AGGREGATORS.test(star[1]) && star[2].trim() && !idLike ? star[2] : star[1];
  }
  t = t.replace(/^(CTTNHH|CTY TNHH|CONG TY TNHH)\s+/i, "");
  t = t.replace(/^(PAYOO|VNPAY|SP)[-\s]+/i, "");
  t = t.split("_")[0];
  t = t
    .replace(/\s*AUTHID:?\S*.*$/i, "")
    .replace(/\s+(PPD|WEB|CO)\s+ID:?.*$/i, "")
    .replace(/\s*Reference\s*#.*$/i, "")
    .replace(/\s*NAME:.*$/i, "")
    .replace(/\s*\d{6,}.*$/, "")
    .replace(/\s+\d{3}-\d{3}-\d{4}.*$/, "")
    .replace(/\s+\d{1,2}\/\d{2}\b/g, "")
    .replace(/\s+\d{1,2}:\d{2}[ap]?\b/gi, "")
    .replace(/\s+#\s*\d+/g, "")
    .replace(/\s+ONLINE$/i, "")
    .replace(/\s+--.*$/, "")
    .replace(/\s+\([A-Z]{2}\)/g, "")
    .replace(/\s+(VNM|USA|AUS|US)$/i, "")
    .replace(PLACES, "")
    .replace(/\s+[A-Z]{2}$/, "")
    .replace(/\s+(T-)?\d{3,}$/i, "")
    .replace(/\s+(WEB|INC\.?|LLC)$/i, "")
    .replace(/[\s,.-]+$/, "")
    .trim();
  if (!t) return "";
  const brand = BRANDS.find(([re]) => re.test(t));
  if (brand) return brand[1];
  return tidyCase(t);
}

/**
 * The name to show for a transaction's payee. The owner's own label in front of a bank line
 * ("Friend (Thành): Zelle payment from …", "Rent received: …") is the name; a bank line is cleaned;
 * anything else comes back as it is.
 */
export function cleanPayee(raw: string | null | undefined): string {
  const t = String(raw ?? "").trim();
  if (!t) return t;
  const label = /^([^:]{4,}?):\s+(.+)$/.exec(t);
  if (
    label &&
    /\p{Ll}/u.test(label[1]) &&
    !/\b(ID|REF|NAME|B\/O|A\/C|VIA)$/i.test(label[1]) &&
    (NOISE.test(label[2]) || mostlyUpper(label[2]))
  ) {
    const head = label[1].replace(/\s*\(on the Rental page\)/i, "").trim();
    // Who actually sent or got a Zelle stays in view: "Friend (Thành): Zelle from Marcus Nguyen".
    const rest = cleanBankLine(label[2]);
    return rest.startsWith("Zelle ") ? `${head}: ${rest}` : head;
  }
  if (!mostlyUpper(t) && !NOISE.test(t) && !PREFIX.test(t)) return t;
  return cleanBankLine(t) || t;
}
