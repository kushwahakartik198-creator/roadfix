import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type OfficerIssue,
  type OperationalIssue,
  type IssueStatus,
  type IssueSeverity,
  type ApiError,
} from "@/lib/api";
import { useAuth } from "@/features/auth/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, CircleDot, Clock3, ClipboardList, Download, MapPin, RotateCcw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { buildComplaintsCsv } from "@/lib/complaint-csv";
import { sortOfficerIssues, type ComplaintSortOrder } from "@/lib/complaint-priority";
import { isWithinComplaintDateRange, type ComplaintDateRange } from "@/lib/complaint-date-range";

function getDirectionsUrl(issue: OfficerIssue): string | null {
  if (!("lat" in issue) || !("lng" in issue)) return null;
  if (typeof issue.lat !== "number" || !Number.isFinite(issue.lat) || issue.lat < -90 || issue.lat > 90) return null;
  if (typeof issue.lng !== "number" || !Number.isFinite(issue.lng) || issue.lng < -180 || issue.lng > 180) return null;

  const params = new URLSearchParams({
    api: "1",
    destination: `${issue.lat},${issue.lng}`,
    travelmode: "driving",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function OfficerPage() {
  const { user, logout } = useAuth();
  const [issues, setIssues] = useState<OfficerIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Record<string, string>>({});
  const [photoUrls, setPhotoUrls] = useState<Record<string, string[]>>({});
  const [severityChoice, setSeverityChoice] = useState<IssueSeverity>("medium");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<IssueStatus | "all">("all");
  const [severityFilter, setSeverityFilter] = useState<IssueSeverity | "all">("all");
  const [sortOrder, setSortOrder] = useState<ComplaintSortOrder>("newest");
  const [dateRange, setDateRange] = useState<ComplaintDateRange>("all");
  async function load() {
    setLoading(true);
    try {
      const result = await api.listOfficerIssues({ page: 1, pageSize: 50 });
      setIssues(result.data);
      setError("");
    } catch (e) {
      const status = (e as ApiError).status;
      setError(
        status === 401
          ? "Your session expired. Sign in again."
          : status === 403
            ? "Your account cannot view this ward."
            : "Unable to load complaints. Check your connection and retry."
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const complaintStats = issues.reduce(
    (counts, issue) => {
      counts.total += 1;
      switch (issue.status) {
        case "submitted":
        case "under_review":
        case "verified":
          counts.pending += 1;
          break;
        case "in_progress":
          counts.inProgress += 1;
          break;
        case "resolved":
          counts.resolved += 1;
          break;
        case "rejected":
          break;
      }
      return counts;
    },
    { total: 0, pending: 0, inProgress: 0, resolved: 0 },
  );
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const dateFilterNow = new Date();
  const filteredIssues = issues.filter((issue) => {
    if (!isWithinComplaintDateRange(issue, dateRange, dateFilterNow)) return false;
    if (statusFilter !== "all" && issue.status !== statusFilter) return false;
    if (severityFilter !== "all") {
      const severity = "id" in issue ? issue.severity : null;
      if (severity !== severityFilter) return false;
    }
    if (!normalizedQuery) return true;

    const searchableFields = [
      issue.reference,
      "id" in issue ? issue.id : "",
      "title" in issue ? issue.title : "",
      "description" in issue ? issue.description : "",
      "locationDescription" in issue ? issue.locationDescription ?? "" : `Ward ${issue.wardId}`,
    ];
    return searchableFields.some((field) => field.toLocaleLowerCase().includes(normalizedQuery));
  });
  const sortedIssues = sortOfficerIssues(filteredIssues, sortOrder);
  const hasActiveFilters = Boolean(searchQuery || statusFilter !== "all" || severityFilter !== "all" || dateRange !== "all");
  function exportFilteredIssues() {
    const csv = buildComplaintsCsv(sortedIssues);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `roadfix-complaints-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    const revokeObjectUrl = URL.revokeObjectURL;
    if (typeof revokeObjectUrl === "function") {
      window.setTimeout(() => revokeObjectUrl.call(URL, url), 0);
    }
  }
  async function update(issue: OperationalIssue, status: IssueStatus, severity?: IssueSeverity) {
    const note =
      status === "rejected"
        ? window.prompt("Private rejection reason (required):")
        : status === "resolved"
          ? window.prompt("Private resolution note (required):")
          : undefined;
    if (["rejected", "resolved"].includes(status) && !note?.trim()) return;
    setBusy(issue.id);
    setError("");
    try {
      await api.transitionIssue(issue.id, {
        status,
        ...(severity ? { severity } : {}),
        ...(note ? { note } : {}),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update complaint");
    } finally {
      setBusy(null);
    }
  }
  async function revealContact(issue: OperationalIssue) {
    try {
      const value = await api.getReporterContact(issue.id);
      setContacts((old) => ({
        ...old,
        [issue.id]:
          value?.reporterContact || value?.reporterName || "No contact details were provided.",
      }));
    } catch (e) {
      setError(
        (e as ApiError).status === 403
          ? "Contact details are available only for complaints assigned to you."
          : "Could not retrieve reporter contact details."
      );
    }
  }
  async function loadPhotos(issue: OperationalIssue) {
    try {
      const photos = await api.listComplaintPhotos(issue.id);
      const urls = await Promise.all(
        photos.map(async (p) => URL.createObjectURL(await api.getComplaintPhoto(issue.id, p.id)))
      );
      setPhotoUrls((old) => ({ ...old, [issue.id]: urls }));
    } catch (e) {
      setError(
        (e as ApiError).status === 403
          ? "Photos are restricted to the assigned officer and administrators."
          : "Could not load private photos."
      );
    }
  }
  return (
    <section className="mx-auto max-w-5xl space-y-5 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Officer dashboard</h1>
          <p>
            {user?.displayName || "Officer"} · Ward {user?.wardId ?? "not assigned"}
          </p>
        </div>
        <div className="flex gap-2">
          {user?.role === "admin" && (
            <Button asChild variant="outline">
              <Link to="/admin">Admin dashboard</Link>
            </Button>
          )}
          <Button variant="outline" onClick={() => void logout()}>
            Log out
          </Button>
        </div>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded border border-destructive/30 p-3 text-sm text-destructive"
        >
          {error}{" "}
          <Button variant="link" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {([
          { label: "Total Complaints", value: complaintStats.total, Icon: ClipboardList },
          { label: "Pending Complaints", value: complaintStats.pending, Icon: Clock3 },
          { label: "In Progress", value: complaintStats.inProgress, Icon: CircleDot },
          { label: "Resolved", value: complaintStats.resolved, Icon: CheckCircle2 },
        ] as const).map(({ label, value, Icon }) => (
          <Card key={label} className="transition-colors hover:border-primary/50">
            <CardContent className="flex items-center justify-between gap-3 p-4 sm:p-5">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</p>
              </div>
              <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-primary sm:h-6 sm:w-6" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search complaints"
              placeholder="Search ID, title, description or location"
              className="pl-9"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <select
            aria-label="Filter by status"
            className="input min-h-[44px] w-full"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as IssueStatus | "all")}
          >
            <option value="all">All Statuses</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under Review</option>
            <option value="verified">Verified</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="rejected">Rejected</option>
          </select>
          <select
            aria-label="Filter by severity"
            className="input min-h-[44px] w-full"
            value={severityFilter}
            onChange={(event) => setSeverityFilter(event.target.value as IssueSeverity | "all")}
          >
            <option value="all">All Severities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <select
            aria-label="Sort complaints"
            className="input min-h-[44px] w-full"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as ComplaintSortOrder)}
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="highest_severity">Highest Severity First</option>
            <option value="lowest_severity">Lowest Severity First</option>
          </select>
          <select
            aria-label="Filter by submission date"
            className="input min-h-[44px] w-full"
            value={dateRange}
            onChange={(event) => setDateRange(event.target.value as ComplaintDateRange)}
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="last_7_days">Last 7 Days</option>
            <option value="last_30_days">Last 30 Days</option>
          </select>
          <Button
            type="button"
            variant="outline"
            className="w-full lg:w-auto"
            disabled={!hasActiveFilters}
            onClick={() => {
              setSearchQuery("");
              setStatusFilter("all");
              setSeverityFilter("all");
              setDateRange("all");
            }}
          >
            <RotateCcw aria-hidden="true" />
            Clear filters
          </Button>
          <Button
            type="button"
            className="w-full lg:w-auto"
            disabled={filteredIssues.length === 0}
            onClick={exportFilteredIssues}
          >
            <Download aria-hidden="true" />
            Export CSV
          </Button>
        </div>
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {sortedIssues.length} matching {sortedIssues.length === 1 ? "complaint" : "complaints"}
        </p>
      </div>
      {loading ? (
        <p role="status">Loading complaints…</p>
      ) : issues.length === 0 ? (
        <Card>
          <CardContent className="p-6">No complaints are available in your ward.</CardContent>
        </Card>
      ) : sortedIssues.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <div>
              <p className="font-semibold">No complaints match your filters.</p>
              <p className="text-sm text-muted-foreground">Try another search or clear the selected filters.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("all");
                setSeverityFilter("all");
                setDateRange("all");
              }}
            >
              Clear filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sortedIssues.map((issue) => {
            const details = "id" in issue ? issue : null;
            const directionsUrl = getDirectionsUrl(issue);
            const canManage = Boolean(details && (user?.role === "admin" || details.assignedOfficerId === user?.officerId));
            const submittedAt = "submittedAt" in issue ? issue.submittedAt : issue.createdAt;
            const priority = details?.severity === "high"
              ? { label: "Critical", className: "border-red-500/30 bg-red-500/10 text-red-300" }
              : details?.severity === "medium"
                ? { label: "Moderate", className: "border-orange-500/30 bg-orange-500/10 text-orange-300" }
                : details?.severity === "low"
                  ? { label: "Normal", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" }
                  : { label: "Unrated", className: "border-border bg-secondary text-muted-foreground" };
            return (
              <Card key={issue.reference}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap justify-between gap-2 text-base">
                    <span>
                      {details?.title ?? "Restricted complaint"} · {issue.reference}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 font-normal capitalize">
                      <span>{issue.status.replaceAll("_", " ")}{details ? ` · ${details.severity ?? "unrated"}` : ""}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${priority.className}`}>
                        {priority.label}
                      </span>
                    </span>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {issue.category.replaceAll("_", " ")} · {details?.locationDescription || `Ward ${issue.wardId}`} ·{" "}
                    {new Date(submittedAt).toLocaleDateString()}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {details && <p className="whitespace-pre-line">{details.description}</p>}
                  <div className="flex flex-wrap gap-2">
                    {details && canManage && details.status === "submitted" && (
                      <Button
                        disabled={busy === details.id}
                        onClick={() => void update(details, "under_review")}
                      >
                        Begin review
                      </Button>
                    )}
                    {details && canManage && details.status === "under_review" && (
                      <>
                        <select
                          aria-label={`Severity for ${details.reference}`}
                          className="input"
                          value={severityChoice}
                          onChange={(e) => setSeverityChoice(e.target.value as IssueSeverity)}
                        >
                          {["low", "medium", "high"].map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <Button
                          disabled={busy === details.id}
                          onClick={() => void update(details, "verified", severityChoice)}
                        >
                          Verify
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy === details.id}
                          onClick={() => void update(details, "rejected")}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                    {details && canManage && details.status === "verified" && (
                      <Button
                        disabled={busy === details.id}
                        onClick={() => void update(details, "in_progress")}
                      >
                        Start work
                      </Button>
                    )}
                    {details && canManage && details.status === "in_progress" && (
                      <Button
                        disabled={busy === details.id}
                        onClick={() => void update(details, "resolved")}
                      >
                        Resolve
                      </Button>
                    )}
                    {details && canManage && (
                      <>
                        <Button variant="outline" onClick={() => void revealContact(details)}>
                          Show reporter contact
                        </Button>
                        <Button variant="outline" onClick={() => void loadPhotos(details)}>
                          Load private photos
                        </Button>
                      </>
                    )}
                    <Button asChild variant="link">
                      <Link to={`/track?q=${issue.reference}`}>Public tracking view</Link>
                    </Button>
                    {directionsUrl && (
                      <Button asChild variant="link">
                        <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
                          <MapPin aria-hidden="true" />
                          Navigate to pothole
                        </a>
                      </Button>
                    )}
                  </div>
                  {!canManage && user?.role !== "admin" && (
                    <p className="text-xs text-muted-foreground">
                      Restricted summary shown. Management, contact and photo access are limited to the assigned officer.
                    </p>
                  )}
                  {details && contacts[details.id] && (
                    <p className="rounded bg-secondary p-3 text-sm">
                      Reporter contact: {contacts[details.id]}
                    </p>
                  )}
                  {details && photoUrls[details.id]?.map((url) => (
                    <img
                      key={url}
                      src={url}
                      alt="Private complaint evidence"
                      className="max-h-64 rounded object-contain"
                    />
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
