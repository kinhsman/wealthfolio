// money-hub patch: several words to look for, any of them matching (owner, 09-30: "multiple
// keywords ... in OR operation", for merchants and for rules). Type a word, Enter (or a comma) adds
// it; a word being typed counts too, so a single word needs no Enter.
import { useState } from "react";

import { Icons, Input } from "@wealthfolio/ui";

/** The words plus the one being typed, one of each whatever the case. */
export function withTyped(words: string[], typing: string): string[] {
  const all = [...words, typing].map((w) => w.trim()).filter((w) => w.length >= 2);
  return [...new Map(all.map((w) => [w.toUpperCase(), w])).values()];
}

export function KeywordChips({
  id,
  words,
  onChange,
  typing,
  onTyping,
  placeholder,
}: {
  id?: string;
  words: string[];
  onChange: (words: string[]) => void;
  typing: string;
  onTyping: (text: string) => void;
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  const add = () => {
    const next = withTyped(words, typing);
    if (next.length !== words.length) onChange(next);
    onTyping("");
  };
  return (
    <div
      className={`border-input bg-input-bg dark:bg-input/30 flex min-h-[var(--input-height,2.5rem)] w-full flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 ${focused ? "ring-ring ring-2 ring-offset-2 ring-offset-background" : ""}`}
    >
      {words.map((w) => (
        <span key={w.toUpperCase()} className="bg-muted inline-flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 text-xs">
          <span className="truncate">{w}</span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onChange(words.filter((x) => x !== w))}
            aria-label={`Remove ${w}`}
          >
            <Icons.Close className="h-3 w-3" />
          </button>
        </span>
      ))}
      <Input
        id={id}
        value={typing}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(",")) {
            onChange(withTyped(words, v.slice(0, -1)));
            onTyping("");
          } else onTyping(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !typing && words.length) {
            onChange(words.slice(0, -1));
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          add();
        }}
        placeholder={words.length ? "Add another word" : placeholder}
        autoComplete="off"
        className="h-7 min-w-[8rem] flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-transparent"
      />
    </div>
  );
}
