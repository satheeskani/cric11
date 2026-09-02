/**
 * Series-name substrings (case-insensitive) used to filter
 * CricbuzzProvider.getUpcomingMatches() to only the tournaments I
 * actually want predictions for. Matched against Cricbuzz's own
 * `seriesName` field, e.g. "The Hundred Men's Competition 2026" or
 * "Indian Premier League 2026" — add/remove entries here any time,
 * no other code changes needed.
 *
 * These are best-guess substrings based on Cricbuzz's typical naming
 * (confirmed live: "The Hundred Men's Competition 2026"). If a
 * tournament you expect isn't showing up, log the raw seriesName
 * values from a getUpcomingMatches() call and adjust the substring here.
 */
export const ALLOWED_TOURNAMENTS: string[] = [
  "Indian Premier League",
  "Big Bash League",
  "Pakistan Super League",
  "Caribbean Premier League",
  "The Hundred",
  "India tour of Zimbabwe",
  "European T20 Premier League",
];
