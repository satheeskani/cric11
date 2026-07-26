import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCredits(credits: number): string {
  return credits.toFixed(1);
}

/** Cricbuzz-style match timing: "Today, 5:00 PM" / "Tomorrow, ..." instead of a bare date. */
export function formatMatchTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  if (date.toDateString() === now.toDateString()) return `Today, ${time}`;

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${time}`;

  return `${date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}
