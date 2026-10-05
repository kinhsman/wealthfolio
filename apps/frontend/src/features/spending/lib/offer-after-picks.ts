// money-hub patch: what follows a category the owner picked by hand, wherever he picked it (owner,
// 2026-10-05: changed the Apple Card charge to Subscriptions and "it didnt give me the rule offer").
// A pick in a row's own column already offered a rule (lib/rule-offer.ts) and, for a subscription or
// bill category, asked which one it is (lib/track-charge.ts); the Categorize button on the selection
// bar and the Assistant's list of proposals saved the category and said nothing more. All of them
// come through here now, so the follow-up is one thing.
import { offerRule, rulePatternFrom } from "./rule-offer";
import { askWhichOne } from "./track-charge";

type Charge = Parameters<typeof askWhichOne>[0]["activity"];
type Categories = Parameters<typeof askWhichOne>[0]["categories"];

export interface HandPick {
  /** Whole activity when the caller has it: lets a subscription or bill category ask which one. */
  activity?: Charge;
  notes?: string | null;
  taxonomyId: string;
  categoryId: string;
  categoryName: string;
}

const notesOf = (p: HandPick) => p.notes ?? p.activity?.notes ?? null;
const wordsOf = (p: HandPick) => (rulePatternFrom(notesOf(p)) ?? "").toLowerCase();

/**
 * One pick: exactly what the row's own column does. Several at once: one offer, only when every
 * charge says the same words and went to the same category (a mixed batch has no single rule to
 * offer, and a toast per charge would bury the page). Nothing for text with no words to pick.
 */
export function offerAfterPicks(picks: HandPick[], categories: Categories): void {
  const first = picks[0];
  if (!first) return;
  const offer = () =>
    void offerRule({
      notes: notesOf(first),
      taxonomyId: first.taxonomyId,
      categoryId: first.categoryId,
      categoryName: first.categoryName,
    });
  if (picks.length === 1) {
    const asked = askWhichOne({
      activity: first.activity,
      categoryId: first.categoryId,
      categories,
      categoryName: first.categoryName,
      after: offer,
    });
    if (!asked) offer();
    return;
  }
  const key = (p: HandPick) => `${wordsOf(p)}|${p.categoryId}`;
  if (!wordsOf(first) || picks.some((p) => key(p) !== key(first))) return;
  offer();
}
