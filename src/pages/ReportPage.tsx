/**
 * RoadFix — Report a Civic Issue
 *
 * Fully-working citizen submission flow backed by the local RoadFix server.
 * Citizens pick a ward, drop a location pin, describe the issue, attach up to
 * up to three photos, and submit. The server assigns a reference (RF-AG-XXXXXXXX) and
 * persists the report. No mock or fallback data is used.
 */
import { lazy, Suspense, useState, useCallback, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import {
  LocateFixed,
  Camera,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  X,
  Loader2,
  Droplets,
  Lightbulb,
  Wrench,
} from "lucide-react";
import { api, type IssueCategory, type IssueSeverity, type NearbyPotholeMatch, type Ward } from "@/lib/api";

const STEPS = 3;

type FormData = {
  wardId: string;
  wardName: string;
  category: IssueCategory;
  description: string;
  locationDescription: string;
  lat: number;
  lng: number;
  reporterName: string;
  reporterContact: string;
  severity: IssueSeverity;
  photos: string[]; // data URLs
};

const CATEGORIES: { value: IssueCategory; label: string; icon: React.ElementType }[] = [
  { value: "pothole", label: "Pothole", icon: AlertTriangle },
  { value: "waterlogging", label: "Waterlogging", icon: Droplets },
  { value: "open_manhole", label: "Open Manhole", icon: AlertTriangle },
  { value: "streetlight", label: "Streetlight", icon: Lightbulb },
  { value: "garbage", label: "Garbage / Dumping", icon: AlertTriangle },
  { value: "erosion", label: "Road Erosion", icon: AlertTriangle },
  { value: "water_pipe_leak", label: "Water Pipe Leak", icon: Wrench },
  { value: "damaged_sign", label: "Damaged Sign", icon: AlertTriangle },
  { value: "other", label: "Other", icon: AlertTriangle },
];

const SEVERITIES: { value: IssueSeverity; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const SEVERITY_VARIANT: Record<IssueSeverity, BadgeProps["variant"]> = {
  low: "outline",
  medium: "secondary",
  high: "warning",
};

function severityVariant(severity: IssueSeverity) {
  return SEVERITY_VARIANT[severity] ?? "secondary";
}

const AGRA_CENTER = [27.18, 78.02] as [number, number];
const LocationMap = lazy(() => import("@/components/report/LocationMap"));

export function ReportPage() {
  const [step, setStep] = useState(1);
  const [wards, setWards] = useState<Ward[]>([]);
  const [wardsLoading, setWardsLoading] = useState(true);
  const [mapTilesUnavailable, setMapTilesUnavailable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormData>({
    wardId: "",
    wardName: "",
    category: "pothole",
    description: "",
    locationDescription: "",
    lat: AGRA_CENTER[0],
    lng: AGRA_CENTER[1],
    reporterName: "",
    reporterContact: "",
    severity: "medium",
    photos: [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastRef, setLastRef] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [nearbyMatches, setNearbyMatches] = useState<NearbyPotholeMatch[]>([]);
  const [nearbyCheckLoading, setNearbyCheckLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nearbyCheckIdRef = useRef(0);

  useEffect(() => () => {
    if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
  }, []);

  useEffect(() => {
    let active = true;
    api.listWards()
      .then((wardList) => active && setWards(wardList))
      .catch(() => active && setWards([]))
      .finally(() => active && setWardsLoading(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const checkId = ++nearbyCheckIdRef.current;
    const coordinatesValid = Number.isFinite(form.lat) && form.lat >= -90 && form.lat <= 90
      && Number.isFinite(form.lng) && form.lng >= -180 && form.lng <= 180;
    setNearbyMatches([]);
    if (form.category !== "pothole" || !form.wardId || !coordinatesValid) {
      setNearbyCheckLoading(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setNearbyCheckLoading(true);
      void (async () => {
        try {
          const matches = await api.findNearbyPotholes(form.lat, form.lng);
          if (nearbyCheckIdRef.current === checkId) setNearbyMatches(Array.isArray(matches) ? matches : []);
        } catch {
          // Duplicate detection is advisory; keep the report flow available if this check fails.
          if (nearbyCheckIdRef.current === checkId) setNearbyMatches([]);
        } finally {
          if (nearbyCheckIdRef.current === checkId) setNearbyCheckLoading(false);
        }
      })();
    }, 350);

    return () => {
      window.clearTimeout(timer);
      if (nearbyCheckIdRef.current === checkId) nearbyCheckIdRef.current += 1;
    };
  }, [form.category, form.lat, form.lng, form.wardId]);

  const setField = useCallback((field: keyof FormData, value: FormData[keyof FormData]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const validate = (targetStep?: number) => {
    const next: Record<string, string> = {};
    if (!targetStep || targetStep === 1) {
      if (!form.wardId) next.wardId = "Please select a ward.";
      if (!form.locationDescription.trim()) next.locationDescription = "Please describe the exact location.";
    }
    if (!targetStep || targetStep === 2) {
      if (!form.description || form.description.trim().length < 10) {
        next.description = "Please describe the issue in at least 10 characters.";
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const continueTo = (nextStep: number) => {
    if (!validate(step)) return;
    setStep(nextStep);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const input = {
        wardId: form.wardId,
        category: form.category,
        description: form.description.trim(),
        lat: form.lat,
        lng: form.lng,
        locationDescription: form.locationDescription.trim() || null,
        reporterName: form.reporterName.trim() || null,
        reporterContact: form.reporterContact.trim() || null,
        severity: form.severity,
        photos: form.photos,
      } as Parameters<typeof api.createIssue>[0];
      const created = await api.createIssue(input);
      setLastRef(created.reference);
      setStep(STEPS);
      toast.success("Report submitted!", {
        description: `Reference: ${created.reference}. Save it to track your report.`,
      });
    } catch (err: unknown) {
      const apiError = err as { body?: { error?: string } };
      toast.error("Submission failed", {
        description: apiError.body?.error || (err instanceof Error ? err.message : "Unable to submit. Is the local server running?"),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePhoto = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Choose a photo smaller than 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = (reader.result as string) || "";
      if (dataUrl) setForm((prev) => ({ ...prev, photos: [...prev.photos, dataUrl].slice(0, 3) }));
    };
    reader.readAsDataURL(file);
  };

  const copyReference = async () => {
    if (!lastRef) return;
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(lastRef);
        copied = true;
      }
    } catch {
      // Try the selection-based fallback below when Clipboard API access is denied.
    }

    if (!copied) {
      const fallback = document.createElement("textarea");
      fallback.value = lastRef;
      fallback.setAttribute("readonly", "");
      fallback.style.position = "fixed";
      fallback.style.opacity = "0";
      document.body.appendChild(fallback);
      fallback.select();
      try {
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      } finally {
        fallback.remove();
      }
    }

    if (!copied) {
      toast.error("Could not copy the reference. Please select and copy it manually.");
      return;
    }
    setCopyState("copied");
    if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
    copyResetTimerRef.current = setTimeout(() => setCopyState("idle"), 1500);
  };

  const wardOpts = wards.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }));

  const renderNearbyWarning = () => {
    if (nearbyCheckLoading) {
      return <p role="status" className="rounded-md border border-border bg-secondary/50 p-3 text-sm text-muted-foreground">Checking for nearby pothole reports…</p>;
    }
    if (!nearbyMatches.length) return null;
    return (
      <div role="status" aria-live="polite" className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-foreground">
        <div className="flex items-start gap-2">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="min-w-0">
            <p className="font-semibold">A similar pothole may already have been reported nearby.</p>
            <ul className="mt-2 space-y-1">
              {nearbyMatches.map((match) => (
                <li key={match.reference} className="break-words">
                  <span className="font-mono font-medium">{match.reference}</span>
                  {` · ${match.status.replaceAll("_", " ")}`}
                  {Number.isFinite(match.distanceMeters) && match.distanceMeters >= 0
                    ? ` · approximately ${match.distanceMeters < 1 ? "less than 1" : Math.round(match.distanceMeters)} metres away`
                    : ""}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-muted-foreground">If this is a different pothole, you can continue and submit your report.</p>
          </div>
        </div>
      </div>
    );
  };

  const progress = step / STEPS;

  return (
    <div className="box-border mx-auto w-full min-w-0 max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Report a civic issue</span>
      </nav>

      <div className="rounded-xl border border-border bg-card/50 p-3 sm:p-4">
        <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-semibold sm:text-xs">
          {["Location", "Details", "Review"].map((label, index) => (
            <span key={label} className={step >= index + 1 ? "text-primary" : "text-muted-foreground"}>
              <span className="mr-1 hidden sm:inline">{index + 1}.</span>{label}
            </span>
          ))}
        </div>
        <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${(progress * 100).toFixed(0)}%` }}
          />
        </div>
      </div>

      {!lastRef && step === 1 && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-lg">Step 1 — Where is the issue?</CardTitle>
            <p className="text-sm text-muted-foreground">
              Select the ward and set the location. Map tiles load from OpenStreetMap when internet is available.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ward">Ward (area)</Label>
                <select
                  id="ward"
                  value={form.wardId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const w = wards.find((x) => x.id === id);
                    setField("wardId", id);
                    setField("wardName", w?.name ?? "");
                    setField("lat", w?.lat ?? AGRA_CENTER[0]);
                    setField("lng", w?.lng ?? AGRA_CENTER[1]);
                  }}
                  className="input"
                  disabled={wardsLoading}
                >
                  <option value="">Choose a ward…</option>
                  {wardOpts.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {errors.wardId && <span className="text-xs text-destructive">{errors.wardId}</span>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Landmark / exact spot</Label>
                <Input
                  id="location"
                  placeholder="e.g. Near Sadar Bazar police chowki"
                  value={form.locationDescription}
                  onChange={(e) => setField("locationDescription", e.target.value)}
                />
                {errors.locationDescription && (
                  <span className="text-xs text-destructive">{errors.locationDescription}</span>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-secondary bg-card/50 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-foreground">Map location</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!navigator.geolocation) {
                      toast.error("Geolocation is not supported by your browser.");
                      return;
                    }
                    toast.loading("Detecting your location…", { id: "geo" });
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        toast.dismiss("geo");
                        toast.success("Location detected.", {
                          description: "Pin dropped at your current position.",
                        });
                        setField("lat", pos.coords.latitude);
                        setField("lng", pos.coords.longitude);
                      },
                      (err) => {
                        toast.dismiss("geo");
                        toast.error("Could not detect location. Please enter it manually.");
                        console.error(err);
                      },
                      { enableHighAccuracy: true, timeout: 10000 },
                    );
                  }}
                >
                  <LocateFixed className="h-4 w-4 mr-2" aria-hidden="true" />
                  Use my location
                </Button>
              </div>
              <div
                className="aspect-video rounded-xl border border-border overflow-hidden relative"
                style={{ minHeight: 320 }}
              >
                <Suspense fallback={<div className="grid h-full min-h-80 place-items-center bg-secondary text-sm text-muted-foreground" role="status">Loading location map…</div>}>
                  <LocationMap
                    lat={form.lat}
                    lng={form.lng}
                    onChange={(lat, lng) => {
                      setField("lat", lat);
                      setField("lng", lng);
                    }}
                    onTilesUnavailable={() => setMapTilesUnavailable(true)}
                  />
                </Suspense>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
                  <div className="text-primary text-3xl font-bold drop-shadow-md" aria-hidden="true">
                    ▼
                  </div>
                </div>
              </div>
              {mapTilesUnavailable && (
                <p role="status" className="mt-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
                  Online map tiles are unavailable. The map pin and complaint form still work locally. Enter coordinates below or use the location description; no online map is being shown.
                </p>
              )}
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="latitude">Latitude</Label>
                  <Input id="latitude" type="number" step="any" min="-90" max="90" value={form.lat}
                    onChange={(event) => {
                      const value = event.currentTarget.valueAsNumber;
                      if (Number.isFinite(value) && value >= -90 && value <= 90) setField("lat", value);
                    }} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="longitude">Longitude</Label>
                  <Input id="longitude" type="number" step="any" min="-180" max="180" value={form.lng}
                    onChange={(event) => {
                      const value = event.currentTarget.valueAsNumber;
                      if (Number.isFinite(value) && value >= -180 && value <= 180) setField("lng", value);
                    }} />
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                Click the map or enter coordinates. Coordinates:
                {form.lat.toFixed(4)}, {form.lng.toFixed(4)}
              </div>
              {renderNearbyWarning()}
            </div>
          </CardContent>
          <CardFooter className="justify-end">
            <Button onClick={() => continueTo(2)} disabled={wardsLoading}>
              Next: Issue details <ChevronRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {!lastRef && step === 2 && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-lg">Step 2 — Describe the issue</CardTitle>
            <p className="text-sm text-muted-foreground">
              What happened, how severe is it, and any supporting photo.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-5">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="category">Issue type</Label>
                <div className="report-issue-grid grid w-full max-w-full gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
                  {CATEGORIES.map((c) => {
                    const Icon = c.icon;
                    const active = form.category === c.value;
                    return (
                      <Button
                        key={c.value}
                        variant={active ? "default" : "outline"}
                        className="report-issue-button w-full min-w-0 max-w-full justify-start whitespace-normal text-left text-sm"
                        onClick={() => setField("category", c.value)}
                      >
                        <span className="report-issue-button__content flex min-w-0 items-center gap-2">
                          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span className="report-issue-button__label">{c.label}</span>
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="severity">Severity</Label>
                <div className="grid w-full max-w-full grid-cols-1 gap-2 sm:grid-cols-3">
                  {SEVERITIES.map((s) => {
                    const active = form.severity === s.value;
                    return (
                      <Button
                        key={s.value}
                        variant={active ? "default" : "outline"}
                        className="w-full text-sm capitalize"
                        onClick={() => setField("severity", s.value)}
                      >
                        {s.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                rows={4}
                className="input"
                placeholder="Describe the issue in detail…"
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {form.description.trim().length}/1000 characters
              </p>
              {errors.description && <span className="text-xs text-destructive">{errors.description}</span>}
            </div>

            <div className="space-y-2">
              <Label>Reporter details (optional)</Label>
              <p className="text-xs text-muted-foreground">You can report anonymously. These details remain private to authorized staff.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="reporterName">Your name</Label>
                  <Input
                    id="reporterName"
                    placeholder="Anoop Dwivedi"
                    value={form.reporterName}
                    onChange={(e) => setField("reporterName", e.target.value)}
                  />
                  {errors.reporterName && <span className="text-xs text-destructive">{errors.reporterName}</span>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reporterContact">Contact number</Label>
                  <Input
                    id="reporterContact"
                    type="tel"
                    placeholder="+91 99887 76654"
                    value={form.reporterContact}
                    onChange={(e) => setField("reporterContact", e.target.value)}
                  />
                  {errors.reporterContact && (
                    <span className="text-xs text-destructive">{errors.reporterContact}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="photo">Photo (optional)</Label>
                <span className="text-xs text-muted-foreground">(up to 3, max 5 MB each)</span>
              </div>
              <div className="border border-border rounded-xl p-4 flex flex-col items-center gap-3 hover:bg-secondary/50 transition-colors relative cursor-pointer">
                <input
                  id="photo"
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    const chosen = Array.from(e.target.files ?? []);
                    const allowed = Math.max(0, 3 - form.photos.length);
                    if (chosen.length > allowed) toast.error("A complaint may include at most three photos.");
                    for (const file of chosen.slice(0, allowed)) handlePhoto(file);
                    e.target.value = "";
                  }}
                />
                <label
                  className="flex flex-col items-center gap-2"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("label")) {
                      fileInputRef.current?.click();
                    }
                  }}
                >
                  <Camera className="h-5 w-5" aria-hidden="true" />
                  <span>Upload photos ({form.photos.length}/3)</span>
                </label>
                {form.photos.map((photo, index) => (
                  <div key={`${photo.slice(0, 32)}-${index}`} className="relative group">
                    <img src={photo} alt={`Photo preview ${index + 1}`} className="h-24 w-24 rounded-md object-cover border border-border" />
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setForm((prev) => ({ ...prev, photos: prev.photos.filter((_, photoIndex) => photoIndex !== index) }));
                      }}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Up to three JPEG/PNG/WebP photos, 5 MB each. Photos are private to assigned staff.
              </p>
            </div>
          </CardContent>
          <CardFooter className="justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ChevronLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Back
            </Button>
            <Button onClick={() => continueTo(3)}>
              Next: Review <ChevronRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {!lastRef && step === 3 && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-lg">Step 3 — Review &amp; submit</CardTitle>
            <p className="text-sm text-muted-foreground">
              Confirm your report before it is sent to the municipal team.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="bg-secondary/50 p-3 rounded-lg">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Ward</div>
                <div className="font-medium text-foreground">{form.wardName}</div>
              </div>
              <div className="bg-secondary/50 p-3 rounded-lg">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Issue type</div>
                <div className="font-medium text-foreground">
                  {CATEGORIES.find((c) => c.value === form.category)?.label}
                </div>
              </div>
              <div className="bg-secondary/50 p-3 rounded-lg">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Severity</div>
                <Badge variant={severityVariant(form.severity)}>{form.severity}</Badge>
              </div>
              <div className="bg-secondary/50 p-3 rounded-lg">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Location</div>
                <div className="font-medium text-foreground truncate">
                  {form.locationDescription || "Not specified"}
                </div>
              </div>
            </div>

            <div className="bg-secondary/50 p-3 rounded-lg">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Description</div>
              <p className="text-sm text-foreground whitespace-pre-line">{form.description}</p>
            </div>

            {renderNearbyWarning()}

            {form.photos.length > 0 && (
              <div className="bg-secondary/50 p-3 rounded-lg">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Attached photos (private to staff)</div>
                <div className="flex flex-wrap gap-2">{form.photos.map((photo, index) => <img key={`${photo.slice(0, 32)}-${index}`} src={photo} alt={`Attached photo ${index + 1}`} className="h-24 w-24 rounded-md object-cover border border-border" />)}</div>
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              Once submitted, you&apos;ll receive a reference number to track your report. Your report
              will be assigned to the ward inspector for {form.wardName}.
            </div>
          </CardContent>
          <CardFooter className="justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ChevronLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Back
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="shadow-glow">
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Submitting…
                </>
              ) : (
                <>
                  Submit report <CheckCircle className="ml-2 h-4 w-4" aria-hidden="true" />
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      )}

      {lastRef && (
        <Card variant="elevated" className="report-success-card box-border w-full min-w-0 max-w-full border-success bg-success/10">
          <CardContent className="box-border min-w-0 max-w-full p-4 sm:p-6">
            <div className="flex min-w-0 max-w-full items-start gap-3">
              <CheckCircle className="h-6 w-6 text-success" aria-hidden="true" />
              <div className="min-w-0 max-w-full">
                <h3 className="font-semibold text-foreground">Report submitted successfully</h3>
                <p className="text-sm text-muted-foreground">
                  Your report has been assigned to <strong>{form.wardName}</strong>. Use this reference to track progress.
                </p>
              </div>
            </div>
            <div className="report-success-reference mt-5 flex max-w-full flex-wrap items-center gap-3">
              <code className="report-success-reference__value box-border max-w-full rounded-lg border border-success/40 bg-background/70 px-4 py-3 font-mono-tech text-xl font-bold text-success sm:text-2xl">{lastRef}</code>
              <Button type="button" variant="outline" size="lg" className="max-w-full" onClick={() => void copyReference()} aria-live="polite">
                {copyState === "copied" ? "Copied ✓" : "Copy"}
              </Button>
            </div>
            <div className="mt-5 flex max-w-full flex-wrap gap-3">
              <Button asChild size="lg" className="max-w-full whitespace-normal text-center shadow-glow">
                <Link to={`/track?q=${encodeURIComponent(lastRef)}`}>Track my report</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="max-w-full whitespace-normal text-center">
                <Link to="/">Return home</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
