/**
 * RoadFix — Officer Dashboard (Triage)
 *
 * Working officer workflow: pick an officer, view reported issues (grouped by
 * ward), verify/reject/start/resolve them, and assign issues to ward officers.
 * All transitions call the local server, which enforces the transition matrix.
 */
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { MapPin, ChevronRight, Loader2, User, ShieldCheck, AlertTriangle } from "lucide-react";
import { api, type IssueSeverity, type IssueStatus, type Officer, type Issue } from "@/lib/api";

const STATUS_ORDER: string[] = ["reported", "verified", "in_progress", "resolved", "rejected"];

const STATUS_BADGE: Record<string, Parameters<typeof Badge>["variant"]> = {
  reported: "secondary",
  verified: "info",
  in_progress: "warning",
  resolved: "success",
  rejected: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  reported: "Reported",
  verified: "Verified",
  in_progress: "In Progress",
  resolved: "Resolved",
  rejected: "Rejected",
};

export function OfficerPage() {
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [wardOptions, setWardOptions] = useState<{ id: string; name: string }[]>([]);
  const [selectedOfficer, setSelectedOfficer] = useState<Officer | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [openIssue, setOpenIssue] = useState<Issue | null>(null);
  const [transitioning, setTransitioning] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    api.listOfficers().then((list) => active && setOfficers(list)).catch(() => active && setOfficers([]));
    api.listWards()
      .then((wards) => active && setWardOptions(wards.map((w) => ({ id: w.id, name: w.name }))))
      .catch(() => active && setWardOptions([]));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedOfficer) {
      setIssues([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const params: Parameters<typeof api.listIssues>[0] = {};
    if (selectedOfficer.wardId) params.wardId = selectedOfficer.wardId;
    let active = true;
    api.listIssues(params)
      .then((res) => {
        if (!active) return;
        setIssues(res.data);
      })
      .catch(() => active && setIssues([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [selectedOfficer]);

  const filtered = issues.filter((i) => {
    if (filterStatus && i.status !== filterStatus) return false;
    return true;
  });

  const canAct = (issue: Issue) => {
    if (!selectedOfficer) return false;
    if (selectedOfficer.role === "senior_engineer") return true;
    return selectedOfficer.wardId === issue.wardId;
  };

  const isTransitioning = (id: string) => Boolean(transitioning[id]);

  const handleTransition = async (issue: Issue, toStatus: IssueStatus, extra: { severity?: IssueSeverity; note?: string }) => {
    if (!selectedOfficer) return;
    setTransitioning((prev) => ({ ...prev, [issue.id]: true }));
    try {
      const input = { status: toStatus, ...extra };
      const updated = await api.transitionIssue(issue.id, input, selectedOfficer.id);
      setIssues((list) => list.map((i) => (i.id === issue.id ? updated : i)));
      setOpenIssue(null);
      toast.success(`Issue ${STATUS_LABEL[toStatus]}`);
    } catch (err: unknown) {
      const apiError = err as { body?: { error?: string } };
      toast.error("Transition failed", {
        description: apiError.body?.error || (err instanceof Error ? err.message : "Unable to update the issue."),
      });
    } finally {
      setTransitioning((prev) => ({ ...prev, [issue.id]: false }));
    }
  };

  const handleAssign = async (issue: Issue, officerId: string) => {
    if (!selectedOfficer || selectedOfficer.role !== "senior_engineer") {
      toast.error("Only senior engineers can assign issues.");
      return;
    }
    setTransitioning((prev) => ({ ...prev, [issue.id]: true }));
    try {
      const updated = await api.assignIssue(issue.id, officerId, selectedOfficer.id);
      setIssues((list) => list.map((i) => (i.id === issue.id ? updated : i)));
      setOpenIssue(null);
      toast.success("Issue assigned");
    } catch (err: unknown) {
      const apiError = err as { body?: { error?: string } };
      toast.error("Assignment failed", {
        description: apiError.body?.error || (err instanceof Error ? err.message : "Unable to assign the issue."),
      });
    } finally {
      setTransitioning((prev) => ({ ...prev, [issue.id]: false }));
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex flex-col items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Loading officer dashboard…</p>
        </div>
      </div>
    );
  }

  if (!selectedOfficer) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Card className="text-center p-12">
          <User className="h-12 w-12 mx-auto text-primary mb-4" aria-hidden="true" />
          <CardTitle className="text-lg">Officer context</CardTitle>
          <p className="text-sm text-muted-foreground mb-6">
            Choose the municipal officer whose dashboard you want to work from.
          </p>
          <Label htmlFor="officerSelect" className="sr-only">Acting officer</Label>
          <select
            id="officerSelect"
            value=""
            onChange={(e) => setSelectedOfficer(officers.find((o) => o.id === e.target.value) ?? null)}
            className="input mb-4 text-left"
          >
            <option value="">Select an officer</option>
            {officers.map((o) => (
              <option key={o.id} value={o.id}>{o.name} — {o.role}</option>
            ))}
          </select>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {officers.map((o) => (
              <Button key={o.id} onClick={() => setSelectedOfficer(o)} className="w-auto min-w-[200px]">
                <div className="flex items-center gap-2">
                  <div className="text-xs text-muted-foreground">{o.role}</div>
                  <div className="text-sm font-medium text-foreground">{o.name}</div>
                </div>
              </Button>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  const wardName = selectedOfficer.wardId
    ? wardOptions.find((w) => w.id === selectedOfficer.wardId)?.name ?? selectedOfficer.wardId
    : "None (city-wide)";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/" className="text-primary hover:underline">Home</Link>
        <span aria-hidden="true">&rsaquo;</span>
        <span>Officer dashboard</span>
      </nav>

      <div className="flex flex-col lg:flex-row gap-4 items-end">
        <div className="flex-1 min-w-[260px]">
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Officer context</CardTitle>
              <p className="text-sm text-muted-foreground">
                All actions below are taken as this officer.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="officerSelect">Acting officer</Label>
                <select
                  id="officerSelect"
                  value={selectedOfficer.id}
                  onChange={(e) =>
                    setSelectedOfficer(officers.find((o) => o.id === e.target.value) ?? null)
                  }
                  className="input"
                >
                  {officers.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} — {o.role}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">Ward: {wardName}</p>
              </div>
              <div className="space-y-2">
                <Label>Quick status filter</Label>
                <div className="grid grid-cols-2 gap-2">
                  {STATUS_ORDER.map((s) => (
                    <Button
                      key={s}
                      variant={filterStatus === s ? "default" : "outline"}
                      size="sm"
                      className="w-full text-xs justify-between capitalize"
                      onClick={() => setFilterStatus(filterStatus === s ? null : s)}
                    >
                      {STATUS_LABEL[s]}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/wards">Browse all wards</Link>
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 border border-border rounded-xl bg-card/50">
          <div className="flex flex-col items-center gap-2">
            <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground" aria-hidden="true" />
            <h3 className="font-medium text-foreground">No issues to triage</h3>
            <p className="text-sm text-muted-foreground">
              {selectedOfficer.wardId
                ? `No issues found in ${wardName}.`
                : "No issues reported yet."}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((issue) => (
            <Card key={issue.id} variant="interactive" className="hover:border-primary/50">
              <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={STATUS_BADGE[issue.status] ?? "secondary"}>
                      {STATUS_LABEL[issue.status]}
                    </Badge>
                    <Badge variant="outline" className="text-xs">{issue.severity}</Badge>
                  </div>
                  <h4 className="font-semibold text-foreground">{issue.title}</h4>
                  <p className="text-sm text-muted-foreground truncation">
                    {issue.description.slice(0, 120)}{issue.description.length > 120 ? "…" : ""}
                  </p>
                </div>
                <div className="text-right">
                  <div className="font-mono-tech text-xs text-muted-foreground">{issue.reference}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {issue.category.replace(/_/g, " ")}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    <MapPin className="h-3 w-3 mr-1" aria-hidden="true" />
                    {wardOptions.find((w) => w.id === issue.wardId)?.name ?? issue.wardId}
                  </span>
                  <span>Reported {new Date(issue.createdAt).toLocaleDateString()}</span>
                </div>
                {issue.rejectionReason && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2">
                    <div className="flex items-center gap-1 mb-1">
                      <AlertTriangle className="h-3 w-3 text-destructive" aria-hidden="true" />
                      <span className="text-xs font-semibold text-destructive-foreground uppercase tracking-wider">
                        Rejected
                      </span>
                    </div>
                    <p className="text-xs text-foreground">{issue.rejectionReason}</p>
                  </div>
                )}
                {openIssue?.id === issue.id && (
                  <TransitionForm
                    issue={issue}
                    onTransition={handleTransition}
                    onAssign={handleAssign}
                    officers={officers}
                    onClose={() => setOpenIssue(null)}
                    isTransitioning={isTransitioning(issue.id)}
                  />
                )}
                <CardFooter className="justify-between items-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOpenIssue(openIssue?.id === issue.id ? null : issue)}
                    disabled={!canAct(issue)}
                  >
                    {openIssue?.id === issue.id ? "Close actions" : canAct(issue) ? "Take action" : "Not your ward"}
                  </Button>
                  <Button asChild size="sm" className="ml-2">
                    <Link to={`/track?q=${issue.reference}`}>
                      View <ChevronRight className="ml-1 h-3 w-3" aria-hidden="true" />
                    </Link>
                  </Button>
                </CardFooter>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </div>
  );
}

function TransitionForm({
  issue,
  onTransition,
  onAssign,
  officers,
  onClose,
  isTransitioning,
}: {
  issue: Issue;
  onTransition: (issue: Issue, toStatus: IssueStatus, extra: { severity?: IssueSeverity; note?: string }) => void;
  onAssign: (issue: Issue, officerId: string) => void;
  officers: Officer[];
  onClose: () => void;
  isTransitioning: boolean;
}) {
  const [severity, setSeverity] = useState("medium");
  const [note, setNote] = useState("");
  const [assignOfficerId, setAssignOfficerId] = useState("");

  const wardOfficers = officers.filter((o) => o.active);

  const actions: { label: string; toStatus: IssueStatus; needsSeverity?: boolean; needsNote?: boolean }[] = [];

  if (issue.status === "reported") {
    actions.push({ label: "Verify issue", toStatus: "verified", needsSeverity: true });
    actions.push({ label: "Reject issue", toStatus: "rejected", needsNote: true });
  } else if (issue.status === "verified") {
    actions.push({ label: "Start work (in progress)", toStatus: "in_progress" });
    actions.push({ label: "Reject issue", toStatus: "rejected", needsNote: true });
  } else if (issue.status === "in_progress") {
    actions.push({ label: "Resolve issue", toStatus: "resolved", needsNote: true });
    actions.push({ label: "Reject issue", toStatus: "rejected", needsNote: true });
  } else if (issue.status === "resolved") {
    actions.push({ label: "Reopen issue", toStatus: "reported" });
  } else if (issue.status === "rejected") {
    actions.push({ label: "Reopen issue", toStatus: "reported" });
  }

  const needsSeverity = actions.some((a) => a.needsSeverity);
  const needsNote = actions.some((a) => a.needsNote);

  return (
    <Card className="border-primary bg-primary/5">
      <CardHeader>
        <CardTitle className="text-lg">Take action</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {actions.map((a) => (
          <Button
            key={a.toStatus}
            variant={a.toStatus === "rejected" ? "destructive" : "default"}
            onClick={() => {
              const extra: { severity?: string; note?: string } = {};
              if (a.needsSeverity) extra.severity = severity;
              if (a.needsNote) {
                if (!note.trim()) {
                  toast.error("A note is required.");
                  return;
                }
                extra.note = note;
              }
              onTransition(issue, a.toStatus, extra);
            }}
            disabled={isTransitioning}
            className="w-full justify-between text-sm"
          >
            <span>{a.label}</span>
            {(a.needsSeverity || a.needsNote) && (
              <span className="text-[10px] text-muted-foreground">
                {a.needsSeverity ? "severity" : ""}
                {a.needsSeverity && a.needsNote ? " + " : ""}
                {a.needsNote ? "note" : ""}
              </span>
            )}
          </Button>
        ))}
        {(needsSeverity || needsNote) && (
          <div className="grid grid-cols-2 gap-2">
            {needsSeverity && (
              <div className="space-y-1">
                <Label htmlFor="triageSeverity">Severity</Label>
                <select
                  id="triageSeverity"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as IssueSeverity)}
                  className="input h-9 text-xs"
                >
                  {["low", "medium", "high", "critical"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}
            {needsNote && (
              <div className="space-y-1">
                <Label htmlFor="triageNote">Note / reason</Label>
                <textarea
                  id="triageNote"
                  rows={2}
                  className="input h-12 text-xs"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            )}
          </div>
        )}
        {issue.status === "verified" && wardOfficers.length > 0 && (
          <div className="space-y-1">
            <Label htmlFor="triageAssign">Assign officer</Label>
            <select
              id="triageAssign"
              value={assignOfficerId}
              onChange={(e) => setAssignOfficerId(e.target.value)}
              className="input h-9 text-xs"
            >
              <option value="">Select officer…</option>
              {wardOfficers.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!assignOfficerId) {
                  toast.error("Select an officer to assign.");
                  return;
                }
                onAssign(issue, assignOfficerId);
              }}
              disabled={isTransitioning}
              className="w-full text-xs"
            >
              Assign
            </Button>
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
