/**
 * RoadFix — API client for the local Node.js server.
 *
 * All requests go to the local RoadFix server (default http://localhost:4000).
 * Override with VITE_API_URL when deployed elsewhere. This client replaces the
 * Supabase client for the fully-working local data layer (no mock/fallback data).
 */

const BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

export interface ApiError extends Error {
  status?: number;
  body?: unknown;
}

/** Server wraps every successful response as { ok: true, data: <payload> }. */
async function json<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return null as unknown as T;
  const parsed = JSON.parse(text);
  if (parsed && parsed.ok === true && Object.prototype.hasOwnProperty.call(parsed, "data")) {
    return parsed.data as T;
  }
  return parsed as T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!res.ok) {
    const err: ApiError = new Error(`API error ${res.status}: ${res.statusText}`) as ApiError;
    err.status = res.status;
    try {
      err.body = await res.json();
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw err;
  }

  return json<T>(res);
}

/** ---------- Domain types (mirrors the local server schema) ---------- */

export interface Ward {
  id: string;
  code: string;
  name: string;
  description: string | null;
  lat: number;
  lng: number;
  active: boolean;
  wardNumber: string;
  createdAt?: string;
}

export interface Officer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  wardId: string | null;
  active: boolean;
  createdAt?: string;
}

export type IssueStatus = "reported" | "verified" | "in_progress" | "resolved" | "rejected";
export type IssueCategory =
  | "pothole"
  | "waterlogging"
  | "open_manhole"
  | "streetlight"
  | "garbage"
  | "erosion"
  | "water_pipe_leak"
  | "damaged_sign"
  | "other";
export type IssueSeverity = "low" | "medium" | "high" | "critical";

export interface Issue {
  id: string;
  reference: string;
  title: string;
  description: string;
  category: IssueCategory;
  status: IssueStatus;
  severity: IssueSeverity;
  wardId: string;
  locationDescription: string | null;
  lat: number;
  lng: number;
  reporterName: string;
  reporterContact: string | null;
  reporterId: string | null;
  assignedOfficerId: string | null;
  assignedAt: string | null;
  rejectionReason: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IssueHistory {
  id: string;
  issueId: string;
  eventType: "created" | "status_change" | "assignment" | "note" | "reopened";
  fromStatus: IssueStatus | null;
  toStatus: IssueStatus | null;
  actorId: string | null;
  actorRole: string | null;
  note: string | null;
  createdAt: string;
}

export interface PagedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** ---------- Wards ---------- */

export async function listWards(params?: { q?: string; active?: string }): Promise<Ward[]> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.active !== undefined) qs.set("active", params.active);
  return request<Ward[]>(`/api/wards${qs.toString() ? `?${qs}` : ""}`);
}

export async function getWard(id: string): Promise<Ward> {
  return request<Ward>(`/api/wards/${encodeURIComponent(id)}`);
}

export async function listWardIssues(
  wardId: string,
  params?: { status?: string; severity?: string; page?: number; pageSize?: number }
): Promise<PagedResult<Issue>> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.severity) qs.set("severity", params.severity);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
  return request<PagedResult<Issue>>(`/api/wards/${encodeURIComponent(wardId)}/issues?${qs}`);
}

/** ---------- Issues ---------- */

export interface IssueListParams {
  wardId?: string;
  status?: IssueStatus;
  severity?: IssueSeverity;
  category?: IssueCategory;
  assignedOfficerId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  dir?: "asc" | "desc";
}

export async function listIssues(params?: IssueListParams): Promise<PagedResult<Issue>> {
  const qs = new URLSearchParams();
  if (params?.wardId) qs.set("wardId", params.wardId);
  if (params?.status) qs.set("status", params.status);
  if (params?.severity) qs.set("severity", params.severity);
  if (params?.category) qs.set("category", params.category);
  if (params?.assignedOfficerId) qs.set("assignedOfficerId", params.assignedOfficerId);
  if (params?.q) qs.set("q", params.q);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params?.sort) qs.set("sort", params.sort);
  if (params?.dir) qs.set("dir", params.dir);
  return request<PagedResult<Issue>>(`/api/issues?${qs}`);
}

export async function getIssue(id: string): Promise<Issue> {
  return request<Issue>(`/api/issues/${encodeURIComponent(id)}`);
}

export async function trackIssue(reference: string): Promise<Issue> {
  return request<Issue>(`/api/issues/${encodeURIComponent(reference)}/track`);
}

export async function getIssueHistory(id: string): Promise<IssueHistory[]> {
  return request<IssueHistory[]>(`/api/issues/${encodeURIComponent(id)}/history`);
}

export interface CreateIssueInput {
  wardId: string;
  category: IssueCategory;
  description: string;
  lat: number;
  lng: number;
  locationDescription?: string;
  reporterName?: string;
  reporterContact?: string;
  severity?: IssueSeverity;
  title?: string;
  photo?: string; // data URL
}

export async function createIssue(input: CreateIssueInput): Promise<Issue> {
  return request<Issue>("/api/issues", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface TransitionIssueInput {
  status?: IssueStatus;
  severity?: IssueSeverity;
  note?: string;
}

export async function transitionIssue(
  id: string,
  input: TransitionIssueInput,
  officerId: string
): Promise<Issue> {
  return request<Issue>(`/api/issues/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "X-Officer-Id": officerId },
    body: JSON.stringify(input),
  });
}

export async function assignIssue(id: string, officerId: string, actorId: string): Promise<Issue> {
  return request<Issue>(`/api/issues/${encodeURIComponent(id)}/assign`, {
    method: "POST",
    headers: { "X-Officer-Id": actorId },
    body: JSON.stringify({ officerId }),
  });
}

/** ---------- Officers ---------- */

export async function listOfficers(params?: { q?: string; wardId?: string; active?: string }): Promise<Officer[]> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.wardId) qs.set("wardId", params.wardId);
  if (params?.active !== undefined) qs.set("active", params.active);
  return request<Officer[]>(`/api/officers${qs.toString() ? `?${qs}` : ""}`);
}

export async function getOfficer(id: string): Promise<Officer> {
  return request<Officer>(`/api/officers/${encodeURIComponent(id)}`);
}

/** ---------- Stats ---------- */

export interface Stats {
  total: number;
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
  byWard: { name: string; count: number }[];
}

export async function getStats(): Promise<Stats> {
  return request<Stats>("/api/stats");
}

/** Convenience client used by the page components. */
export const api = {
  listWards,
  getWard,
  listWardIssues,
  listIssues,
  getIssue,
  trackIssue,
  getIssueHistory,
  createIssue,
  transitionIssue,
  assignIssue,
  listOfficers,
  getOfficer,
  getStats,
};
