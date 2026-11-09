/**
 * RoadFix — Track a Report
 *
 * Public tracking by reference number (RF-AG-XXXXXXXX). No authentication
 * required — powered by the local server&apos;s track_complaint-style endpoint.
 * Displays the issue, its current status, ward, and full audit timeline.
 */
import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, AlertTriangle, Loader2, ShieldCheck, ArrowRight } from "lucide-react";
import { api, type Issue, type IssueHistory } from "@/lib/api";

const STATUS_BADGE: Record<string, Parameters<typeof Badge>["variant"]> = {
  reported: "secondary",
  verified: "info",
  in_progress: "warning",
  resolved: "success",
  rejected: "destructive",
};

export function TrackPage() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [issue, setIssue] = useState<Issue | null>(null);
  const [history, setHistory] = useState<IssueHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (ref: string) => {
    if (!ref.trim()) {
      setError("Please enter a reference number (e.g. RF-AG-A1B2C3D4).");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const iss = await api.trackIssue(ref.trim());
      const hist = await api.getIssueHistory(iss.id);
      setIssue(iss);
      setHistory(hist);
    } catch (err: unknown) {
      const apiError = err as { body?: { error?: string } };
      setIssue(null);
      setHistory([]);
      setError(apiError.body?.error || `No report found for reference "${ref}".`);
      toast.error("Report not found", { description: `Check the reference: ${ref}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (query) search(query);
  }, [query]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/" className="text-primary hover:underline">Home</Link>
        <span aria-hidden="true">&rsaquo;</span>
        <span>Track a report</span>
      </nav>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 min-w-[280px]">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="text-lg">Track your report</CardTitle>
              <p className="text-sm text-muted-foreground">
                Enter your reference number to check status and history.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reference">Reference number</Label>
                <div className="relative">
                  <Input
                    id="reference"
                    placeholder="RF-AG-A1B2C3D4"
                    value={query}
                    onChange={(e) => setQuery(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") search(query);
                    }}
                  />
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
              </div>
              <Button
                onClick={() => search(query)}
                disabled={loading || !query.trim()}
                className="w-full shadow-glow"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    Searching…
                  </>
                ) : (
                  <>
                    Track <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                Format: RF-AG-XXXXXXXX (8 alphanumeric characters).
              </p>
            </CardContent>
          </Card>

          <Card className="mt-4 overflow-hidden">
            <CardHeader>
              <CardTitle className="text-lg">Or browse by ward</CardTitle>
              <p className="text-sm text-muted-foreground">See all issues reported in a specific ward.</p>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full justify-between">
                  <Link to="/wards">
                    Explore wards &amp; listed issues
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                  </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {issue && (
          <div className="lg:w-[560px] flex-1">
            <Card className="overflow-hidden">
              <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
                <div>
                  <CardTitle className="text-lg font-bold">{issue.title}</CardTitle>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <Badge variant={STATUS_BADGE[issue.status] ?? "secondary"}>
                      {issue.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </Badge>
                    <Badge variant="outline">{issue.category.replace(/_/g, " ")}</Badge>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono-tech font-bold text-primary">{issue.reference}</div>
                  <div className="text-xs text-muted-foreground">Category severity: {issue.severity}</div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</div>
                  <p className="text-sm text-foreground whitespace-pre-line">{issue.description}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-secondary/50 p-3 rounded-lg">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Ward</div>
                    <div className="font-medium text-foreground truncate">{issue.wardId}</div>
                  </div>
                  <div className="bg-secondary/50 p-3 rounded-lg">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Location</div>
                    <div className="font-medium text-foreground truncate">
                      {issue.locationDescription || "Not specified"}
                    </div>
                  </div>
                  <div className="bg-secondary/50 p-3 rounded-lg">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Status updated</div>
                    <div className="font-medium text-foreground">{new Date(issue.updatedAt).toLocaleDateString()}</div>
                  </div>
                  <div className="bg-secondary/50 p-3 rounded-lg">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Reported</div>
                    <div className="font-medium text-foreground">{new Date(issue.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>
                {issue.photoUrl && (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <img src={issue.photoUrl} alt="Report photo" className="w-full h-48 object-cover" />
                  </div>
                )}
                {issue.resolutionNote && (
                  <div className="bg-success/10 border border-success/20 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
                      <div className="text-xs font-semibold text-success-foreground uppercase tracking-wider">Resolution</div>
                    </div>
                    <p className="text-sm text-foreground">{issue.resolutionNote}</p>
                    {issue.resolvedAt && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Resolved {new Date(issue.resolvedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                )}
                {issue.rejectionReason && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />
                      <div className="text-xs font-semibold text-destructive-foreground uppercase tracking-wider">Rejected</div>
                    </div>
                    <p className="text-sm text-foreground">{issue.rejectionReason}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="mt-4 overflow-hidden">
              <CardHeader>
                <CardTitle className="text-lg">Status history</CardTitle>
                <p className="text-sm text-muted-foreground">Audit trail of every change to this report.</p>
              </CardHeader>
              <CardContent className="py-0">
                <div className="space-y-0 border-l border-secondary pl-4">
                  {history.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No history yet.</p>
                  ) : (
                    history.map((h, i) => (
                      <div key={h.id} className="relative mb-6 last:mb-0">
                        <div className="absolute -left-[10px] top-1.5 w-2 h-2 rounded-full bg-primary border-2 border-card z-10" />
                        <div className="flex items-start gap-3">
                          <div className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center shrink-0 text-xs text-secondary-foreground border border-card">
                            {i + 1}
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-foreground">
                              {h.eventType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(h.createdAt).toLocaleString()}
                              {h.note ? ` — ${h.note}` : ""}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
