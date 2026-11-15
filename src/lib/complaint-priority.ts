import type { IssueSeverity, OfficerIssue } from "@/lib/api";
import { getSubmissionTimestamp } from "@/lib/complaint-date-range";

export type ComplaintSortOrder = "newest" | "oldest" | "highest_severity" | "lowest_severity";

function compareDateNewestFirst(left: OfficerIssue, right: OfficerIssue): number {
  const leftDate = getSubmissionTimestamp(left);
  const rightDate = getSubmissionTimestamp(right);
  if (leftDate === null) return rightDate === null ? 0 : 1;
  if (rightDate === null) return -1;
  return rightDate - leftDate;
}

function severityRank(severity: IssueSeverity | null | undefined, order: ComplaintSortOrder): number {
  if (order === "highest_severity") {
    return severity === "high" ? 0 : severity === "medium" ? 1 : severity === "low" ? 2 : 3;
  }
  return severity === "low" ? 0 : severity === "medium" ? 1 : severity === "high" ? 2 : 3;
}

export function sortOfficerIssues(issues: OfficerIssue[], order: ComplaintSortOrder): OfficerIssue[] {
  return issues
    .map((issue, index) => ({ issue, index }))
    .sort(({ issue: left, index: leftIndex }, { issue: right, index: rightIndex }) => {
      let comparison = 0;
      if (order === "oldest") {
        comparison = -compareDateNewestFirst(left, right);
        // Invalid or missing dates remain at the end in both date directions.
        if (getSubmissionTimestamp(left) === null && getSubmissionTimestamp(right) !== null) comparison = 1;
        if (getSubmissionTimestamp(right) === null && getSubmissionTimestamp(left) !== null) comparison = -1;
      } else if (order === "highest_severity" || order === "lowest_severity") {
        const leftSeverity = "severity" in left ? left.severity : null;
        const rightSeverity = "severity" in right ? right.severity : null;
        comparison = severityRank(leftSeverity, order) - severityRank(rightSeverity, order);
        if (comparison === 0) comparison = compareDateNewestFirst(left, right);
      } else {
        comparison = compareDateNewestFirst(left, right);
      }
      return comparison || leftIndex - rightIndex;
    })
    .map(({ issue }) => issue);
}
