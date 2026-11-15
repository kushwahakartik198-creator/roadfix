import type { IssueStatus, PublicHistory } from "@/lib/api";

export const COMPLAINT_PROGRESS_STAGES = [
  { status: "submitted", label: "Submitted" },
  { status: "under_review", label: "Under Review" },
  { status: "verified", label: "Verified" },
  { status: "in_progress", label: "In Progress" },
  { status: "resolved", label: "Resolved" },
] as const satisfies ReadonlyArray<{ status: IssueStatus; label: string }>;

const VALID_STATUSES = new Set<IssueStatus>([
  "submitted", "under_review", "verified", "in_progress", "resolved", "rejected",
]);
const VALID_EVENT_TYPES = new Set<PublicHistory["eventType"]>([
  "created", "status_change", "assignment", "reopened", "note",
]);

export function normalizePublicHistory(value: unknown): PublicHistory[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is PublicHistory => {
    if (!item || typeof item !== "object") return false;
    const event = item as Record<string, unknown>;
    const validStatus = (status: unknown) => status === null || VALID_STATUSES.has(status as IssueStatus);
    return VALID_EVENT_TYPES.has(event.eventType as PublicHistory["eventType"])
      && validStatus(event.fromStatus)
      && validStatus(event.toStatus);
  });
}

export type ComplaintStageState = "completed" | "current" | "upcoming" | "not_reached";

export function reliableTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const isoTimestamp = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  const parts = dateOnly ?? isoTimestamp;
  if (!parts) return null;
  const [, yearText, monthText, dayText] = parts;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return null;
  if (isoTimestamp) {
    const hours = Number(isoTimestamp[4]);
    const minutes = Number(isoTimestamp[5]);
    const seconds = Number(isoTimestamp[6]);
    if (hours > 23 || minutes > 59 || seconds > 59 || !Number.isFinite(Date.parse(value))) return null;
  }
  return value;
}

export function formatReliableTimestamp(value: unknown): string | null {
  const reliable = reliableTimestamp(value);
  if (!reliable) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(reliable);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString();
  }
  return new Date(reliable).toLocaleString();
}

function recordedTimestamp(status: IssueStatus, history: PublicHistory[]): string | null {
  const event = history.find((item) => item.toStatus === status
    && ["created", "status_change", "reopened"].includes(item.eventType)
    && reliableTimestamp(item.createdAt) !== null);
  return event ? reliableTimestamp(event.createdAt) : null;
}

export interface ComplaintTimelineStage {
  status: (typeof COMPLAINT_PROGRESS_STAGES)[number]["status"];
  label: string;
  state: ComplaintStageState;
  timestamp: string | null;
}

export interface ComplaintTimelineModel {
  currentStatus: IssueStatus;
  rejectedAt: string | null;
  stages: ComplaintTimelineStage[];
}

export function buildComplaintTimeline(
  status: IssueStatus,
  submittedAt: unknown,
  history: PublicHistory[],
): ComplaintTimelineModel {
  const currentIndex = COMPLAINT_PROGRESS_STAGES.findIndex((stage) => stage.status === status);
  const isRejected = status === "rejected";
  const submittedTimestamp = recordedTimestamp("submitted", history) ?? reliableTimestamp(submittedAt);

  return {
    currentStatus: status,
    rejectedAt: isRejected ? recordedTimestamp("rejected", history) : null,
    stages: COMPLAINT_PROGRESS_STAGES.map((stage, index) => {
      let state: ComplaintStageState;
      if (isRejected) {
        state = index === 0 || history.some((item) => item.toStatus === stage.status && ["created", "status_change", "reopened"].includes(item.eventType))
          ? "completed"
          : "not_reached";
      } else if (index < currentIndex) {
        state = "completed";
      } else if (index === currentIndex) {
        state = "current";
      } else {
        state = "upcoming";
      }

      const timestamp = stage.status === "submitted"
        ? submittedTimestamp
        : state === "completed" || state === "current"
          ? recordedTimestamp(stage.status, history)
          : null;
      return { ...stage, state, timestamp };
    }),
  };
}
