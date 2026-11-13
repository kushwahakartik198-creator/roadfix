import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type PublicHistory, type PublicTrack, type ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function TrackPage() {
  const [params] = useSearchParams();
  const [reference, setReference] = useState(params.get("q") ?? "");
  const [track, setTrack] = useState<PublicTrack | null>(null);
  const [history, setHistory] = useState<PublicHistory[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function search(event?: React.FormEvent) {
    event?.preventDefault();
    if (!reference.trim()) {
      setError("Enter your report reference number.");
      return;
    }
    setBusy(true);
    setError("");
    setTrack(null);
    setHistory([]);
    try {
      const result = await api.trackIssue(reference.trim());
      const events = await api.getIssueHistory(reference.trim());
      setTrack(result);
      setHistory(events);
    } catch (e) {
      const status = (e as ApiError).status;
      setError(
        status === 429
          ? "Too many attempts. Please wait before trying again."
          : status === 404
            ? "No report was found for that reference."
            : "Tracking is temporarily unavailable. Check your connection and try again."
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mx-auto max-w-3xl space-y-5 px-4 py-8">
      <h1 className="text-2xl font-bold">Track a report</h1>
      <Card>
        <CardHeader>
          <CardTitle>Reference based tracking</CardTitle>
          <p className="text-sm text-muted-foreground">
            Your tracking result shows status and dates only. Keep your reference private.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void search(e)} className="flex flex-col gap-3 sm:flex-row">
            <Input
              aria-label="Reference number"
              placeholder="RF-AG-XXXXXXXX"
              value={reference}
              onChange={(e) => setReference(e.target.value.toUpperCase())}
            />
            <Button disabled={busy}>{busy ? "Searching…" : "Track"}</Button>
          </form>
          {error && (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
      {track && (
        <Card>
          <CardHeader>
            <CardTitle>{track.reference}</CardTitle>
            <p className="capitalize">{track.status.replaceAll("_", " ")}</p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>Reported {new Date(track.submittedAt).toLocaleString()}</p>
            <p>Last updated {new Date(track.lastUpdatedAt).toLocaleString()}</p>
            <p>{track.locationDescription || "Location details are not available."}</p>
            <h2 className="pt-3 font-semibold">Status history</h2>
            {history.map((item, index) => (
              <div key={`${item.createdAt}-${index}`} className="border-l-2 pl-3">
                <p className="capitalize">
                  {item.eventType.replaceAll("_", " ")}
                  {item.toStatus ? ` — ${item.toStatus.replaceAll("_", " ")}` : ""}
                </p>
                <p className="text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <p className="text-sm text-muted-foreground">
        Need to report an issue?{" "}
        <Link className="text-primary underline" to="/report">
          Submit a report
        </Link>
        .
      </p>
    </section>
  );
}
