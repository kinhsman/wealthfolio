// money-hub patch: Trips, which airline a flight is on, so its row can wear the airline's logo.
// Read from the words on the flight (the leg's line like "EVA Air BR 55" or "F9 1227", else the booking's name);
// the name wins over the two-character code because a name is rarely misread. Only airlines listed here get a logo,
// so a gate or seat that looks like a code never shows a wrong one.

/** [two-character code, website (the logo is looked up by it), the airline's name as written]. */
const AIRLINES: [string, string, RegExp][] = [
  ["BR", "evaair.com", /\beva air\b/i],
  ["CI", "china-airlines.com", /\bchina airlines\b/i],
  ["JX", "starlux-airlines.com", /\bstarlux\b/i],
  ["VN", "vietnamairlines.com", /\bvietnam airlines\b/i],
  ["VJ", "vietjetair.com", /\bvietjet\b/i],
  ["QH", "bambooairways.com", /\bbamboo airways\b/i],
  ["F9", "flyfrontier.com", /\bfrontier\b/i],
  ["UA", "united.com", /\bunited( airlines)?\b/i],
  ["AA", "aa.com", /\bamerican( airlines)?\b/i],
  ["DL", "delta.com", /\bdelta\b/i],
  ["WN", "southwest.com", /\bsouthwest\b/i],
  ["B6", "jetblue.com", /\bjetblue\b/i],
  ["AS", "alaskaair.com", /\balaska\b/i],
  ["NK", "spirit.com", /\bspirit\b/i],
  ["HA", "hawaiianairlines.com", /\bhawaiian\b/i],
  ["G4", "allegiantair.com", /\ballegiant\b/i],
  ["SY", "suncountry.com", /\bsun country\b/i],
  ["XP", "aveloair.com", /\bavelo\b/i],
  ["MX", "flybreeze.com", /\bbreeze\b/i],
  ["AC", "aircanada.com", /\bair canada\b/i],
  ["WS", "westjet.com", /\bwestjet\b/i],
  ["AM", "aeromexico.com", /\baeromexico\b/i],
  ["Y4", "volaris.com", /\bvolaris\b/i],
  ["CM", "copaair.com", /\bcopa\b/i],
  ["LA", "latamairlines.com", /\blatam\b/i],
  ["SQ", "singaporeair.com", /\bsingapore (airlines|air)\b/i],
  ["TR", "flyscoot.com", /\bscoot\b/i],
  ["CX", "cathaypacific.com", /\bcathay\b/i],
  ["JL", "jal.com", /\bjapan airlines\b/i],
  ["NH", "ana.co.jp", /\bana\b|\ball nippon\b/i],
  ["KE", "koreanair.com", /\bkorean air\b/i],
  ["OZ", "flyasiana.com", /\basiana\b/i],
  ["TG", "thaiairways.com", /\bthai airways\b/i],
  ["PR", "philippineairlines.com", /\bphilippine airlines\b/i],
  ["5J", "cebupacificair.com", /\bcebu pacific\b/i],
  ["AK", "airasia.com", /\bairasia\b/i],
  ["6E", "goindigo.in", /\bindigo\b/i],
  ["AI", "airindia.com", /\bair india\b/i],
  ["EK", "emirates.com", /\bemirates\b/i],
  ["QR", "qatarairways.com", /\bqatar\b/i],
  ["EY", "etihad.com", /\betihad\b/i],
  ["TK", "turkishairlines.com", /\bturkish( airlines)?\b/i],
  ["LH", "lufthansa.com", /\blufthansa\b/i],
  ["BA", "britishairways.com", /\bbritish airways\b/i],
  ["AF", "airfrance.com", /\bair france\b/i],
  ["KL", "klm.com", /\bklm\b/i],
  ["VS", "virginatlantic.com", /\bvirgin atlantic\b/i],
  ["FR", "ryanair.com", /\bryanair\b/i],
  ["U2", "easyjet.com", /\beasyjet\b/i],
  ["IB", "iberia.com", /\biberia\b/i],
  ["LX", "swiss.com", /\bswiss\b/i],
  ["AY", "finnair.com", /\bfinnair\b/i],
  ["EI", "aerlingus.com", /\baer lingus\b/i],
  ["QF", "qantas.com", /\bqantas\b/i],
];

const DOMAIN = new Map(AIRLINES.map(([code, domain]) => [code, domain]));

/** The airline's two-character code, or null when the words do not say (or it is not one listed). `texts`: the flight's lines, best first. */
export function airlineOf(...texts: (string | null | undefined)[]): string | null {
  const all = texts.filter((t): t is string => Boolean(t));
  for (const t of all) for (const [code, , name] of AIRLINES) if (name.test(t)) return code;
  // A flight number: two characters (a letter first) then up to four digits, as in "BR 55", "F9 1227" or "UA1234"
  // (jammed together it needs 2+ digits, so a gate like "B1" + "2" is not taken for one).
  for (const t of all) {
    const m = /(?:^|[^A-Za-z0-9])([A-Z][A-Z0-9]|[0-9][A-Z])(?:\s\d{1,4}|\d{2,4})(?![A-Za-z0-9])/.exec(t);
    if (m && DOMAIN.has(m[1])) return m[1];
  }
  return null;
}

/**
 * The airline's logo address, or null when the code is not a listed airline or no logo.dev key is set (the row keeps
 * its plane icon). `key` is the publishable key typed on Settings, Appearance (see logo-key.ts).
 */
export function airlineLogoUrl(code: string, key: string | null | undefined): string | null {
  const domain = DOMAIN.get(code);
  return domain && key ? `https://img.logo.dev/${domain}?token=${encodeURIComponent(key)}&size=64&format=png` : null;
}
