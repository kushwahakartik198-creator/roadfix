/** Typed client for the local RoadFix API. Browser credentials are HttpOnly cookies. */

const BASE_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
let csrfToken: string | null = null;
let sessionExpiredHandler: (() => void) | null = null;

export interface ApiError extends Error {
  status?: number;
  body?: unknown;
  retryAfter?: number;
}

export function setCsrfToken(token: string | null) { csrfToken = token; }
export function setSessionExpiredHandler(handler: (() => void) | null) { sessionExpiredHandler = handler; }

async function unwrap<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return null as T;
  const payload = JSON.parse(text) as { ok?: boolean; data?: T };
  if (payload?.ok === true && Object.hasOwn(payload, "data")) return payload.data as T;
  return payload as T;
}

async function request<T>(path: string, init: RequestInit = {}, requiresSession = false): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const method = (init.method ?? "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && csrfToken && !headers.has("X-CSRF-Token")) {
    headers.set("X-CSRF-Token", csrfToken);
  }
  const response = await fetch(`${BASE_URL}${path}`, { ...init, headers, credentials: "include" });
  if (!response.ok) {
    let body: unknown;
    try { body = await response.json(); } catch { body = undefined; }
    const message = typeof body === "object" && body && "error" in body && typeof body.error === "string"
      ? body.error
      : `Request failed (${response.status})`;
    const error: ApiError = new Error(message);
    error.status = response.status;
    error.body = body;
    if (response.status === 401 && requiresSession) sessionExpiredHandler?.();
    const retryAfter = Number(response.headers.get("Retry-After"));
    if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfter = retryAfter;
    throw error;
  }
  return unwrap<T>(response);
}

export type UserRole = "officer" | "admin";
export type IssueStatus = "submitted" | "under_review" | "verified" | "in_progress" | "resolved" | "rejected";
export type IssueSeverity = "low" | "medium" | "high";
export type IssueCategory = "pothole" | "waterlogging" | "open_manhole" | "streetlight" | "garbage" | "erosion" | "water_pipe_leak" | "damaged_sign" | "other";

export interface AuthUser {
  id: string;
  email?: string;
  displayName: string | null;
  role: UserRole;
  officerId: string | null;
  wardId: string | null;
}
export interface AuthSession { user: AuthUser; csrfToken: string; expiresAt: string; }

export interface Ward {
  id: string; code: string; name: string; description: string | null;
  lat: number; lng: number; active: boolean; wardNumber: string; createdAt?: string;
}
export interface Officer {
  id: string; displayName: string | null; wardId: string | null; active: boolean;
}
export interface PublicIssueCard {
  id: string; reference: string; title: string; category: IssueCategory;
  status: IssueStatus; severity: IssueSeverity | null; wardId: string;
  locationDescription: string | null; submittedAt: string; lastUpdatedAt?: string;
}
export interface PublicIssue extends PublicIssueCard { lastUpdatedAt: string; }
export interface PublicTrack {
  reference: string; status: IssueStatus; submittedAt: string;
  lastUpdatedAt: string; locationDescription: string | null;
}
export interface PublicHistory {
  eventType: "created" | "status_change" | "assignment" | "reopened" | "note";
  fromStatus: IssueStatus | null; toStatus: IssueStatus | null; createdAt: string;
}
export interface OperationalIssue {
  id: string; reference: string; title: string; description: string;
  category: IssueCategory; status: IssueStatus; severity: IssueSeverity | null;
  wardId: string; locationDescription: string | null; lat: number; lng: number;
  assignedOfficerId: string | null; assignedAt: string | null;
  rejectionReason: string | null; resolutionNote: string | null; resolvedAt: string | null;
  createdAt: string; updatedAt: string;
}
export interface RestrictedOfficerIssue {
  reference: string; status: IssueStatus; category: IssueCategory; wardId: string; submittedAt: string;
}
export type OfficerIssue = OperationalIssue | RestrictedOfficerIssue;
export interface PagedResult<T> { data: T[]; total: number; page: number; pageSize: number; }
export interface AdminAccount {
  id: string; email: string; role: UserRole; displayName: string | null;
  active: boolean; officerId: string | null; wardId: string | null; officerActive: boolean | null;
}
export interface AuditEntry {
  id: number; actorUserId: string | null; actorName: string | null; actorRole: string;
  action: string; targetComplaintId: string | null; targetUserId: string | null; createdAt: string;
}
export interface ComplaintPhoto { id: string; contentType: string; sizeBytes: number; createdAt: string; }
export interface Stats { total: number; byStatus: Record<IssueStatus, number>; bySeverity: Record<IssueSeverity, number>; byWard: { name: string; count: number }[]; }

export interface CreateIssueInput {
  wardId: string; category: IssueCategory; description: string; lat: number; lng: number;
  locationDescription?: string; reporterName?: string; reporterContact?: string;
  severity?: IssueSeverity; title?: string; photo?: string; photos?: string[];
}

const query = (values: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== "") search.set(key, String(value));
  return search.toString();
};

export const api = {
  login: (email: string, password: string) => request<AuthSession>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  getSession: () => request<AuthSession>("/api/auth/session"),
  logout: () => request<{ loggedOut: boolean }>("/api/auth/logout", { method: "POST", body: JSON.stringify({}) }),

  listWards: (params?: { q?: string; active?: string }) => request<Ward[]>(`/api/wards${query(params ?? {}) ? `?${query(params ?? {})}` : ""}`),
  getWard: (id: string) => request<Ward>(`/api/wards/${encodeURIComponent(id)}`),
  listWardIssues: (wardId: string, params?: { status?: IssueStatus; severity?: IssueSeverity; page?: number; pageSize?: number }) =>
    request<PagedResult<PublicIssueCard>>(`/api/wards/${encodeURIComponent(wardId)}/issues${query(params ?? {}) ? `?${query(params ?? {})}` : ""}`),
  listIssues: (params?: { wardId?: string; status?: IssueStatus; severity?: IssueSeverity; category?: IssueCategory; q?: string; page?: number; pageSize?: number }) =>
    request<PagedResult<OperationalIssue>>(`/api/issues${query(params ?? {}) ? `?${query(params ?? {})}` : ""}`, {}, true),
  listOfficerIssues: (params?: { wardId?: string; status?: IssueStatus; category?: IssueCategory; q?: string; page?: number; pageSize?: number }) =>
    request<PagedResult<OfficerIssue>>(`/api/issues${query(params ?? {}) ? `?${query(params ?? {})}` : ""}`, {}, true),
  getIssue: (id: string) => request<PublicIssue>(`/api/issues/${encodeURIComponent(id)}`),
  trackIssue: (reference: string) => request<PublicTrack>(`/api/issues/${encodeURIComponent(reference)}/track`),
  getIssueHistory: (reference: string) => request<PublicHistory[]>(`/api/issues/${encodeURIComponent(reference)}/track/history`),
  createIssue: (input: CreateIssueInput) => request<{ id: string; reference: string; status: IssueStatus; title: string }>("/api/issues", { method: "POST", body: JSON.stringify(input) }),
  transitionIssue: (id: string, input: { status: IssueStatus; severity?: IssueSeverity; note?: string }) => request<OperationalIssue>(`/api/issues/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }, true),
  assignIssue: (id: string, officerId: string) => request<OperationalIssue>(`/api/issues/${encodeURIComponent(id)}/assign`, { method: "POST", body: JSON.stringify({ officerId }) }, true),
  getReporterContact: (id: string) => request<{ reporterName: string | null; reporterContact: string | null } | null>(`/api/issues/${encodeURIComponent(id)}/reporter-contact`, {}, true),
  listComplaintPhotos: (id: string) => request<ComplaintPhoto[]>(`/api/issues/${encodeURIComponent(id)}/photos`, {}, true),
  async getComplaintPhoto(id: string, photoId: string): Promise<Blob> {
    const response = await fetch(`${BASE_URL}/api/issues/${encodeURIComponent(id)}/photos/${encodeURIComponent(photoId)}`, { credentials: "include" });
    if (!response.ok) {
      if (response.status === 401) sessionExpiredHandler?.();
      throw apiErrorFromResponse(response);
    }
    return response.blob();
  },

  listOfficers: (params?: { q?: string; wardId?: string; active?: string }) => request<Officer[]>(`/api/officers${query(params ?? {}) ? `?${query(params ?? {})}` : ""}`),
  getStats: () => request<Stats>("/api/stats"),
  createWard: (input: { name: string; code: string; wardNumber: string; description?: string; lat: number; lng: number }) => request<Ward>("/api/wards", { method: "POST", body: JSON.stringify(input) }, true),

  listAdminAccounts: () => request<AdminAccount[]>("/api/admin/accounts", {}, true),
  createStaffAccount: (input: { email: string; password: string; displayName: string; role: UserRole; wardId?: string }) => request<AdminAccount>("/api/admin/accounts", { method: "POST", body: JSON.stringify(input) }, true),
  setAccountActive: (id: string, active: boolean) => request<{ updated: boolean }>(`/api/admin/accounts/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ active }) }, true),
  setOfficerWard: (id: string, wardId: string | null) => request<{ updated: boolean }>(`/api/admin/accounts/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ wardId }) }, true),
  listAdminAudit: () => request<AuditEntry[]>("/api/admin/audit", {}, true),
};

async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  let body: unknown;
  try { body = await response.json(); } catch { body = undefined; }
  const message = typeof body === "object" && body && "error" in body && typeof body.error === "string" ? body.error : `Request failed (${response.status})`;
  const error: ApiError = new Error(message);
  error.status = response.status; error.body = body;
  const retryAfter = Number(response.headers.get("Retry-After"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfter = retryAfter;
  return error;
}
