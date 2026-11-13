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

export function OfficerPage() {
  const { user, logout } = useAuth();
  const [issues, setIssues] = useState<OfficerIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Record<string, string>>({});
  const [photoUrls, setPhotoUrls] = useState<Record<string, string[]>>({});
  const [severityChoice, setSeverityChoice] = useState<IssueSeverity>("medium");
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
      {loading ? (
        <p role="status">Loading complaints…</p>
      ) : issues.length === 0 ? (
        <Card>
          <CardContent className="p-6">No complaints are available in your ward.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {issues.map((issue) => {
            const details = "id" in issue ? issue : null;
            const canManage = Boolean(details && (user?.role === "admin" || details.assignedOfficerId === user?.officerId));
            const submittedAt = "submittedAt" in issue ? issue.submittedAt : issue.createdAt;
            return (
              <Card key={issue.reference}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap justify-between gap-2 text-base">
                    <span>
                      {details?.title ?? "Restricted complaint"} · {issue.reference}
                    </span>
                    <span className="font-normal capitalize">
                      {issue.status.replaceAll("_", " ")}{details ? ` · ${details.severity ?? "unrated"}` : ""}
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
