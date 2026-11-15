import { Check, Circle, CircleAlert } from "lucide-react";
import type { IssueStatus, PublicHistory } from "@/lib/api";
import { buildComplaintTimeline, formatReliableTimestamp } from "@/lib/complaint-timeline";

interface ComplaintActivityTimelineProps {
  status: IssueStatus;
  submittedAt: string;
  history: PublicHistory[];
}

export function ComplaintActivityTimeline({ status, submittedAt, history }: ComplaintActivityTimelineProps) {
  const timeline = buildComplaintTimeline(status, submittedAt, history);
  const rejectedAt = formatReliableTimestamp(timeline.rejectedAt);

  return (
    <section aria-labelledby="complaint-progress-heading" className="space-y-3 rounded-lg border border-border bg-secondary/30 p-4">
      <div>
        <h2 id="complaint-progress-heading" className="font-semibold">Complaint progress</h2>
        <p className="text-sm text-muted-foreground">
          Current status: <span className="font-semibold capitalize text-foreground">{timeline.currentStatus.replaceAll("_", " ")}</span>
        </p>
      </div>

      {status === "rejected" && (
        <div role="status" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Complaint rejected</p>
            {rejectedAt && <time dateTime={timeline.rejectedAt ?? undefined}>{rejectedAt}</time>}
          </div>
        </div>
      )}

      <ol aria-label="Complaint status timeline" className="space-y-0">
        {timeline.stages.map((stage, index) => {
          const timestamp = formatReliableTimestamp(stage.timestamp);
          const markerClass = stage.state === "completed"
            ? "border-emerald-500 bg-emerald-500 text-white"
            : stage.state === "current"
              ? "border-primary bg-primary text-primary-foreground ring-4 ring-primary/15"
              : "border-border bg-background text-muted-foreground";
          return (
            <li
              key={stage.status}
              aria-current={stage.state === "current" ? "step" : undefined}
              className={`flex min-h-12 gap-3 ${stage.state === "not_reached" ? "opacity-50" : ""}`}
            >
              <span className="flex w-5 shrink-0 flex-col items-center">
                <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${markerClass}`}>
                  {stage.state === "completed" ? <Check aria-hidden="true" className="h-3 w-3" /> : <Circle aria-hidden="true" className="h-2.5 w-2.5" />}
                </span>
                {index < timeline.stages.length - 1 && <span className="my-1 w-px flex-1 bg-border" />}
              </span>
              <span className="flex flex-1 items-start justify-between gap-3 pb-3">
                <span>
                  <span className="block text-sm font-medium">{stage.label}</span>
                  {timestamp && <time className="block text-xs text-muted-foreground" dateTime={stage.timestamp ?? undefined}>{timestamp}</time>}
                </span>
                <span className={`shrink-0 text-xs ${stage.state === "current" ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                  {stage.state === "completed" ? "Completed" : stage.state === "current" ? "Current" : stage.state === "upcoming" ? "Upcoming" : "Not reached"}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-muted-foreground">
        Progress position reflects the current workflow status. Stage dates appear only when a reliable timestamp is available.
      </p>
    </section>
  );
}
