import type { OfficerIssue } from "@/lib/api";

export type ComplaintDateRange = "all" | "today" | "last_7_days" | "last_30_days";

export function getSubmissionTimestamp(issue: OfficerIssue): number | null {
  const value = "createdAt" in issue ? issue.createdAt : issue.submittedAt;
  if (typeof value !== "string" || !value.trim()) return null;

  // Date-only API values represent a local calendar date, not UTC midnight.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const [, yearText, monthText, dayText] = dateOnly;
    const year = Number(yearText);
    const month = Number(monthText) - 1;
    const day = Number(dayText);
    const localDate = new Date(year, month, day);
    if (localDate.getFullYear() !== year || localDate.getMonth() !== month || localDate.getDate() !== day) return null;
    return localDate.getTime();
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function isWithinComplaintDateRange(
  issue: OfficerIssue,
  range: ComplaintDateRange,
  now = new Date(),
): boolean {
  if (range === "all") return true;
  const timestamp = getSubmissionTimestamp(issue);
  if (timestamp === null) return false;

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(todayStart);
  if (range === "last_7_days") start.setDate(start.getDate() - 6);
  if (range === "last_30_days") start.setDate(start.getDate() - 29);
  const endExclusive = new Date(todayStart);
  endExclusive.setDate(endExclusive.getDate() + 1);

  return timestamp >= start.getTime() && timestamp < endExclusive.getTime();
}
