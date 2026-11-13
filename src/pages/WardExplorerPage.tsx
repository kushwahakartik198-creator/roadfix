/**
 * RoadFix — Ward Explorer
 *
 * Browse municipal wards and the civic issues reported within each ward. This is
 * the ward-based listing the user requested: issues are grouped by their assigned
 * ward so citizens and officers can see what needs attention where.
 */
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MapPin, Search, Loader2, AlertTriangle, ChevronRight } from "lucide-react";
import { api, type Ward } from "@/lib/api";

export function WardExplorerPage() {
  const [wards, setWards] = useState<Ward[]>([]);
  const [stats, setStats] = useState<Record<string, { total: number; byStatus: Record<string, number> }>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([api.listWards(), api.getStats()])
      .then(([wardList, st]) => {
        if (!active) return;
        setWards(wardList);
        const byWard: Record<string, { total: number; byStatus: Record<string, number> }> = {};
        for (const entry of st.byWard) {
          byWard[entry.name] = { total: entry.count, byStatus: {} };
        }
        setStats(byWard);
      })
      .catch(() => active && setWards([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const filtered = wards.filter(
    (w) =>
      w.name.toLowerCase().includes(q.toLowerCase()) ||
      w.code.toLowerCase().includes(q.toLowerCase()) ||
      (w.description ?? "").toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/" className="text-primary hover:underline">Home</Link>
        <span aria-hidden="true">&rsaquo;</span>
        <span>Wards &amp; listed issues</span>
      </nav>

      <div className="flex flex-col lg:flex-row gap-4 items-end">
        <div className="flex-1 min-w-[260px]">
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Explore wards</CardTitle>
              <p className="text-sm text-muted-foreground">
                Issues are listed under their assigned ward. Select a ward to see its reports.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Input
                  id="wardSearch"
                  placeholder="Search wards by name or code…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </div>
              <p className="text-xs text-muted-foreground">
                {filtered.length} of {wards.length} wards
              </p>
            </CardContent>
          </Card>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="ml-auto">
            <Link to="/report">Report a new issue</Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <AlertTriangle className="h-10 w-10 mx-auto text-muted-foreground mb-3" aria-hidden="true" />
          <h3 className="font-medium text-foreground">No wards match your search.</h3>
          <p className="text-sm text-muted-foreground">Try a different ward name or code.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((ward) => {
            const s = stats[ward.name];
            const total = s?.total ?? 0;
            return (
              <Card key={ward.id} variant="interactive" className="hover:border-primary/50 hover:shadow-md">
                <Link className="block" to={`/wards/${ward.id}`}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-5 w-5 text-primary" aria-hidden="true" />
                        <span className="font-mono-tech text-xs text-muted-foreground">{ward.code}</span>
                      </div>
                      <Badge variant="outline">{ward.wardNumber}</Badge>
                    </div>
                    <h3 className="font-semibold text-foreground leading-snug">{ward.name}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">{ward.description}</p>
                    <div className="mt-4 flex items-center justify-between gap-2">
                      <Badge
                        variant={total > 0 ? "secondary" : "outline"}
                        className="px-3 py-1.5 text-xs"
                      >
                        {total} reported issue{total !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                  </CardContent>
                  <CardFooter className="border-t">
                    <span className="text-xs text-muted-foreground">Tap to view listed issues</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  </CardFooter>
                </Link>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-8 border-t border-border pt-6 text-sm text-muted-foreground">
        <p className="mb-2">How it works:</p>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>
            Citizens report an issue and select a ward; the report is <strong>assigned to that ward</strong>.
          </li>
          <li>
            Each ward card shows how many issues are listed under it, across all statuses.
          </li>
          <li>
            Tap a ward to see every issue assigned to it, filterable by status.
          </li>
          <li>
            Officers use the <span className="font-medium">Officer Dashboard</span> to triage and resolve issues in
            their wards.
          </li>
        </ul>
      </div>
    </div>
  );
}
