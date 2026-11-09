/**
 * RoadFix — Ward Detail
 *
 * Lists every civic issue assigned to a ward, filterable by status, severity and
 * category. Click an issue to track it. This is the ward-based listing view.
 */
import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Filter, Clock, ChevronRight, Loader2 } from "lucide-react";
import { api, type Issue } from "@/lib/api";

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

const STATUS_ORDER = ["reported", "verified", "in_progress", "resolved", "rejected"] as const;

export function WardDetailPage() {
  const { wardId } = useParams();
  const [ward, setWard] = useState<{ id: string; name: string; code: string } | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!wardId) return;
    let active = true;
    setLoading(true);
    Promise.all([api.getWard(wardId), api.listWardIssues(wardId)])
      .then(([wardData, issueResult]) => {
        if (!active) return;
        setWard({ id: wardData.id, name: wardData.name, code: wardData.code });
        setIssues(issueResult.data);
      })
      .catch(() => active && setWard(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [wardId]);

  const filtered = issues.filter((i) => {
    if (filterStatus && i.status !== filterStatus) return false;
    if (filterSeverity && i.severity !== filterSeverity) return false;
    if (q) {
      const s = q.toLowerCase();
      return (
        i.title.toLowerCase().includes(s) ||
        i.description.toLowerCase().includes(s) ||
        (i.locationDescription ?? "").toLowerCase().includes(s) ||
        i.reference.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const counts = {
    reported: issues.filter((i) => i.status === "reported").length,
    verified: issues.filter((i) => i.status === "verified").length,
    in_progress: issues.filter((i) => i.status === "in_progress").length,
    resolved: issues.filter((i) => i.status === "resolved").length,
    rejected: issues.filter((i) => i.status === "rejected").length,
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {ward ? (
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link to="/" className="text-primary hover:underline">Home</Link>
          <span aria-hidden="true">&rsaquo;</span>
          <Link to="/wards" className="text-primary hover:underline">Wards</Link>
          <span aria-hidden="true">&rsaquo;</span>
          <span>{ward.name}</span>
        </nav>
      ) : null}

      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Loading ward…</p>
        </div>
      ) : ward ? (
        <>
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            <div className="flex-1 min-w-[300px]">
              <Card className="overflow-hidden">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold">
                      {ward.code}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{ward.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">Ward {ward.code} &bull; Issues listed by ward</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {([["reported", counts.reported], ["in_progress", counts.in_progress], ["resolved", counts.resolved]] as const).map(
                      ([status, count]) => (
                        <div key={status} className="p-3 rounded-lg bg-secondary/50">
                          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                            {STATUS_LABEL[status]}
                          </div>
                          <div className="font-semibold text-foreground">{count}</div>
                        </div>
                      ),
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <span className="text-xs font-semibold uppercase tracking-wider">Filter by status</span>
                    </div>
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
                          {filterStatus === s && (
                            <span className="h-2 w-2 rounded-full bg-primary-foreground" aria-hidden="true" />
                          )}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <span className="text-xs font-semibold uppercase tracking-wider">Filter by severity</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {["low", "medium", "high", "critical"].map((s) => (
                        <Button
                          key={s}
                          variant={filterSeverity === s ? "default" : "outline"}
                          size="sm"
                          className="w-full text-xs justify-between capitalize"
                          onClick={() => setFilterSeverity(filterSeverity === s ? null : s)}
                        >
                          {s}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wardSearch">Search issues</Label>
                    <Input
                      id="wardSearch"
                      placeholder="Search title, description, reference…"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                    />
                  </div>
                  <Button
                    asChild
                    variant="outline"
                    className="w-full mt-2"
                  >
                    <Link to="/report">Report an issue in this ward</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="flex-1 lg:w-auto">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold text-foreground">
                  Issues in {ward.name} ({filtered.length})
                </h2>
                <Badge variant="outline">{issues.length} total listed</Badge>
              </div>
              {filtered.length === 0 ? (
                <div className="text-center py-16 border border-border rounded-xl bg-card/50">
                  <div className="flex flex-col items-center gap-2">
                    <MapPin className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                    <p className="text-sm text-muted-foreground">No issues listed in this ward yet.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map((issue) => (
                    <Card key={issue.id} variant="interactive" asChild className="hover:border-primary/50">
                      <Link to={`/track?q=${issue.reference}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <Badge variant={STATUS_BADGE[issue.status] ?? "secondary"}>
                                  {STATUS_LABEL[issue.status]}
                                </Badge>
                                <Badge variant="outline" className="text-xs">{issue.severity}</Badge>
                                <Badge variant="outline" className="text-xs">{issue.category.replace(/_/g, " ")}</Badge>
                              </div>
                              <h4 className="font-semibold text-foreground">{issue.title}</h4>
                              <p className="text-sm text-muted-foreground line-clamp-1">
                                {issue.locationDescription || "No location description"}
                              </p>
                              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                                <span className="font-mono-tech">{issue.reference}</span>
                                <span>&bull;</span>
                                <span>{new Date(issue.createdAt).toLocaleDateString()}</span>
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          </div>
                        </CardContent>
                      </Link>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
