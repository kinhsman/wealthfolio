// money-hub patch: the lines follow the theme picked for each mode on Settings, Appearance (owner, 10-03):
// the first one (the portfolio) in the theme's chart colour, the ones compared with it in its category colours.
// They were Flexoki's fixed blue, magenta, cyan... (the theme's tokens live on <html>, so they work anywhere).
export const PERFORMANCE_CHART_COLORS = [
  "var(--m-chart)",
  "var(--m-chart-2)",
  "var(--m-cat-5)",
  "var(--m-cat-9)",
  "var(--m-cat-4)",
  "var(--m-cat-1)",
  "var(--m-cat-6)",
  "var(--m-cat-8)",
] as const;
