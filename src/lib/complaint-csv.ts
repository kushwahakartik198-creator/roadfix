import type { OfficerIssue } from "@/lib/api";

export function buildComplaintsCsv(issues: OfficerIssue[]): string {
  const headers = ["Complaint ID", "Title", "Category", "Description", "Location", "Severity", "Status", "Submission date"];
  const escapeCell = (value: string | number | null | undefined) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = issues.map((issue) => [
    issue.reference,
    "title" in issue ? issue.title : "",
    issue.category,
    "description" in issue ? issue.description : "",
    "locationDescription" in issue ? issue.locationDescription : "",
    "severity" in issue ? issue.severity : "",
    issue.status,
    "createdAt" in issue ? issue.createdAt : issue.submittedAt,
  ]);
  return [headers, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n");
}
