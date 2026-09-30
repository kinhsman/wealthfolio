// money-hub patch: several keywords in one rule, any of them matching (owner, 09-30: "same for
// rules as well, multiple keywords can be added to 1 rule"). Wealthfolio keeps one pattern per rule
// and its server is not ours, so several words are saved as the regex (?i)word1|word2 (each word
// escaped): the same "contains, any case" as one word, which its matcher and the money-hub import
// (plaidSync ruleMatcher) both read. ruleToKeywords reads it back into words for the forms.
import type { RuleMatchType } from "../types/rule";

const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function keywordsToRule(words: string[]): { pattern: string; matchType: RuleMatchType } {
  if (words.length <= 1) return { pattern: words[0] ?? "", matchType: "contains" };
  return { pattern: `(?i)${words.map(escape).join("|")}`, matchType: "regex" };
}

/** The words of a "contains" rule, or of a regex made by keywordsToRule; null for any other regex. */
export function ruleToKeywords(pattern: string, matchType: RuleMatchType): string[] | null {
  if (matchType === "contains") return pattern ? [pattern] : [];
  if (matchType !== "regex" || !pattern.startsWith("(?i)")) return null;
  const words: string[] = [];
  let word = "";
  const body = pattern.slice(4);
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "\\") {
      const next = body[i + 1];
      if (next === undefined || !/[.*+?^${}()|[\]\\]/.test(next)) return null; // \b, \d...: a real regex
      word += next;
      i++;
    } else if (c === "|") {
      words.push(word);
      word = "";
    } else if (/[.*+?^${}()[\]]/.test(c)) {
      return null; // an unescaped metacharacter: a real regex
    } else word += c;
  }
  words.push(word);
  return words.length > 1 && words.every((w) => w.trim().length > 0) ? words : null;
}
