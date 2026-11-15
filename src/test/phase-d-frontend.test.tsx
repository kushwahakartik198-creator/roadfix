import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/features/auth/AuthContext";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { TrackPage } from "@/pages/TrackPage";
import { OfficerPage } from "@/pages/OfficerPage";
import { buildComplaintsCsv } from "@/lib/complaint-csv";
import { sortOfficerIssues } from "@/lib/complaint-priority";
import { isWithinComplaintDateRange } from "@/lib/complaint-date-range";
import { buildComplaintTimeline, COMPLAINT_PROGRESS_STAGES, normalizePublicHistory } from "@/lib/complaint-timeline";
import { api, type IssueStatus, type OfficerIssue, type OperationalIssue, type PublicHistory } from "@/lib/api";
import { useAuth } from "@/features/auth/useAuth";
import { Header } from "@/components/layout/Header";

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => (
      <div data-testid="redirect" data-to={to}>
        Redirect
      </div>
    ),
  };
});

vi.mock("@/lib/api", () => ({
  api: {
    getSession: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    trackIssue: vi.fn(),
    getIssueHistory: vi.fn(),
    listIssues: vi.fn(),
    listOfficerIssues: vi.fn(),
    createIssue: vi.fn(),
  },
  setCsrfToken: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Phase D frontend contracts", () => {
  const staffSession = {
    user: { id: "staff-1", displayName: "Test Officer", role: "officer" as const, officerId: "officer-1", wardId: "ward-1" },
    csrfToken: "test-csrf-token",
    expiresAt: "2026-12-01T00:00:00.000Z",
  };
  function AuthHarness() {
    const { user, refresh } = useAuth();
    return <><p>Signed in as: {user?.displayName ?? "Anonymous"}</p><button onClick={() => void refresh()}>Bootstrap session</button></>;
  }
  function renderAuthHarness() {
    return render(<AuthProvider><MemoryRouter><Header /><AuthHarness /></MemoryRouter></AuthProvider>);
  }
  function complaint({ id, reference, status, ...overrides }: Partial<OperationalIssue> & Pick<OperationalIssue, "id" | "reference" | "status">): OperationalIssue {
    return {
      id,
      reference,
      title: "Pothole on Main Street",
      description: "Deep crater near the school entrance",
      category: "pothole",
      status,
      severity: "high",
      wardId: "ward-1",
      locationDescription: "Main Street",
      lat: 27.18,
      lng: 78.02,
      assignedOfficerId: "officer-1",
      assignedAt: null,
      rejectionReason: null,
      resolutionNote: null,
      resolvedAt: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      ...overrides,
    };
  }
  function daysAgo(days: number, hour = 12): string {
    const date = new Date();
    date.setHours(hour, 0, 0, 0);
    date.setDate(date.getDate() - days);
    return date.toISOString();
  }

  it("clears auth state and updates navigation only after successful logout", async () => {
    vi.mocked(api.getSession).mockResolvedValueOnce(staffSession);
    vi.mocked(api.logout).mockResolvedValueOnce({ loggedOut: true });
    renderAuthHarness();
    expect(await screen.findByText("Signed in as: Test Officer")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Log out" })[0]!);
    expect(await screen.findByText("Signed in as: Anonymous")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Staff login" })).toBeInTheDocument();
    expect(api.logout).toHaveBeenCalledTimes(1);
  });

  it("keeps auth and provides a generic retry after a server logout failure", async () => {
    vi.mocked(api.getSession).mockResolvedValueOnce(staffSession);
    vi.mocked(api.logout).mockRejectedValueOnce(new Error("CSRF secret and database detail"));
    renderAuthHarness();
    expect(await screen.findByText("Signed in as: Test Officer")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Log out" })[0]!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Logout could not be confirmed. Your sign-in state is unchanged; please retry.");
    expect(screen.getByText("Signed in as: Test Officer")).toBeInTheDocument();
    expect(screen.queryByText(/CSRF secret|database detail/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Retry logout" }).length).toBeGreaterThan(0);
  });

  it("preserves auth after a network interruption and a successful session bootstrap", async () => {
    vi.mocked(api.getSession).mockResolvedValue(staffSession);
    vi.mocked(api.logout).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderAuthHarness();
    expect(await screen.findByText("Signed in as: Test Officer")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Log out" })[0]!);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bootstrap session" }));
    expect(await screen.findByText("Signed in as: Test Officer")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(api.getSession).toHaveBeenCalledTimes(2);
  });

  it("allows retry after failure and prevents concurrent logout requests", async () => {
    vi.mocked(api.getSession).mockResolvedValueOnce(staffSession);
    let completeLogout!: () => void;
    vi.mocked(api.logout)
      .mockRejectedValueOnce(new Error("rejected origin"))
      .mockImplementationOnce(() => new Promise<{ loggedOut: boolean }>((resolve) => { completeLogout = () => resolve({ loggedOut: true }); }));
    renderAuthHarness();
    expect(await screen.findByText("Signed in as: Test Officer")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Log out" })[0]!);
    const retry = await screen.findAllByRole("button", { name: "Retry logout" });
    fireEvent.click(retry[0]!);
    fireEvent.click(retry[0]!);
    expect(api.logout).toHaveBeenCalledTimes(2);
    expect(retry[0]!).toBeDisabled();
    completeLogout();
    expect(await screen.findByText("Signed in as: Anonymous")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the logout control disabled while a request is pending", async () => {
    vi.mocked(api.getSession).mockResolvedValueOnce(staffSession);
    let completeLogout!: () => void;
    vi.mocked(api.logout).mockImplementationOnce(() => new Promise<{ loggedOut: boolean }>((resolve) => { completeLogout = () => resolve({ loggedOut: true }); }));
    renderAuthHarness();
    expect(await screen.findByText("Signed in as: Test Officer")).toBeInTheDocument();
    const logout = screen.getAllByRole("button", { name: "Log out" })[0]!;
    fireEvent.click(logout);
    const pendingButtons = await screen.findAllByRole("button", { name: "Logging out…" });
    expect(pendingButtons.every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    fireEvent.click(logout);
    expect(api.logout).toHaveBeenCalledTimes(1);
    completeLogout();
    expect(await screen.findByText("Signed in as: Anonymous")).toBeInTheDocument();
  });

  it("redirects unauthenticated staff routes to login while preserving a safe destination", async () => {
    vi.mocked(api.getSession).mockRejectedValueOnce(
      Object.assign(new Error("unauthorized"), { status: 401 })
    );
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/officer"]}>
          <Routes>
            <Route path="/login" element={<p>Staff login page</p>} />
            <Route element={<RequireAuth />}>
              <Route path="/officer" element={<p>Protected officer page</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );
    expect(await screen.findByTestId("redirect")).toHaveAttribute("data-to", "/login");
    expect(screen.queryByText("Protected officer page")).not.toBeInTheDocument();
  });

  it("renders public tracking fields only, without photos or private notes", async () => {
    vi.mocked(api.trackIssue).mockResolvedValueOnce({
      reference: "RF-AG-AB12CD34",
      status: "resolved",
      submittedAt: "2026-01-01T00:00:00Z",
      lastUpdatedAt: "2026-01-02T00:00:00Z",
      locationDescription: "Near public park",
    });
    vi.mocked(api.getIssueHistory).mockResolvedValueOnce([
      {
        eventType: "status_change",
        fromStatus: "in_progress",
        toStatus: "resolved",
        createdAt: "2026-01-02T00:00:00Z",
      },
    ]);
    render(
      <MemoryRouter>
        <TrackPage />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText("Reference number"), {
      target: { value: "RF-AG-AB12CD34" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Track" }));
    expect(await screen.findByText("Near public park")).toBeInTheDocument();
    expect(
      screen.queryByText(/reporter contact|rejection reason|resolution note/i)
    ).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Complaint status timeline" })).toBeInTheDocument();
    expect(screen.getByText("Current status:").parentElement).toHaveTextContent("resolved");
    expect(document.querySelector("img")).toBeNull();
  });

  it("builds truthful timeline positions for every complaint status", () => {
    const statuses: IssueStatus[] = ["submitted", "under_review", "verified", "in_progress", "resolved"];
    statuses.forEach((status, currentIndex) => {
      const model = buildComplaintTimeline(status, "2026-01-01T00:00:00Z", []);
      expect(model.currentStatus).toBe(status);
      expect(model.stages.map((stage) => stage.state)).toEqual(
        model.stages.map((_, index) => index < currentIndex ? "completed" : index === currentIndex ? "current" : "upcoming")
      );
      expect(model.stages[0]?.timestamp).toBe("2026-01-01T00:00:00Z");
      expect(model.stages.slice(1).every((stage) => stage.timestamp === null)).toBe(true);
    });
  });

  it("marks rejected reports separately and uses only recorded status timestamps", () => {
    const history: PublicHistory[] = [
      { eventType: "status_change", fromStatus: "under_review", toStatus: "rejected", createdAt: "2026-01-03T12:00:00Z" },
      { eventType: "status_change", fromStatus: "submitted", toStatus: "under_review", createdAt: "2026-01-02T12:00:00Z" },
      { eventType: "created", fromStatus: null, toStatus: "submitted", createdAt: "2026-01-01T12:00:00Z" },
    ];
    const model = buildComplaintTimeline("rejected", "2026-01-01T12:00:00Z", history);
    expect(model.currentStatus).toBe("rejected");
    expect(model.rejectedAt).toBe("2026-01-03T12:00:00Z");
    expect(model.stages.map((stage) => stage.state)).toEqual([
      "completed", "completed", "not_reached", "not_reached", "not_reached",
    ]);
    expect(model.stages[1]?.timestamp).toBe("2026-01-02T12:00:00Z");
    expect(COMPLAINT_PROGRESS_STAGES.map((stage) => stage.label)).toEqual([
      "Submitted", "Under Review", "Verified", "In Progress", "Resolved",
    ]);
  });

  it("handles missing, malformed and unavailable timestamps without inventing transition dates", () => {
    const incomplete = buildComplaintTimeline("in_progress", "not-a-timestamp", []);
    expect(incomplete.stages.map((stage) => stage.state)).toEqual([
      "completed", "completed", "completed", "current", "upcoming",
    ]);
    expect(incomplete.stages.every((stage) => stage.timestamp === null)).toBe(true);

    const recordedInvalid: PublicHistory[] = [
      { eventType: "status_change", fromStatus: "verified", toStatus: "in_progress", createdAt: "invalid" },
    ];
    expect(buildComplaintTimeline("in_progress", "", recordedInvalid).stages.every((stage) => stage.timestamp === null)).toBe(true);
    const missingTimestamp = normalizePublicHistory([{
      eventType: "status_change", fromStatus: "verified", toStatus: "in_progress",
    }]);
    expect(buildComplaintTimeline("in_progress", "", missingTimestamp).stages.every((stage) => stage.timestamp === null)).toBe(true);
    expect(normalizePublicHistory([{ eventType: "private_action", toStatus: "resolved" }])).toEqual([]);
  });

  it("keeps tracking available and shows a current-status timeline when history cannot be fetched", async () => {
    vi.mocked(api.trackIssue).mockResolvedValueOnce({
      reference: "RF-AG-NOHISTORY1", status: "verified", submittedAt: "2026-01-01T00:00:00Z",
      lastUpdatedAt: "2026-01-02T00:00:00Z", locationDescription: null,
    });
    vi.mocked(api.getIssueHistory).mockRejectedValueOnce(new Error("History unavailable"));
    render(<MemoryRouter><TrackPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Reference number"), { target: { value: "RF-AG-NOHISTORY1" } });
    fireEvent.click(screen.getByRole("button", { name: "Track" }));
    expect(await screen.findByRole("heading", { name: "Complaint progress" })).toBeInTheDocument();
    expect(screen.getByText("Current status:").parentElement).toHaveTextContent("verified");
    expect(screen.getByText(/Recorded transition history is unavailable/i)).toBeInTheDocument();
    expect(screen.getByText("Verified").parentElement?.parentElement).toHaveTextContent("Current");
  });

  it("renders a rejected complaint with a distinct rejected indicator", async () => {
    vi.mocked(api.trackIssue).mockResolvedValueOnce({
      reference: "RF-AG-REJECTED01", status: "rejected", submittedAt: "2026-01-01T00:00:00Z",
      lastUpdatedAt: "2026-01-03T12:00:00Z", locationDescription: "Roadside near the park",
    });
    vi.mocked(api.getIssueHistory).mockResolvedValueOnce([
      { eventType: "status_change", fromStatus: "under_review", toStatus: "rejected", createdAt: "2026-01-03T12:00:00Z" },
    ]);
    render(<MemoryRouter><TrackPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Reference number"), { target: { value: "RF-AG-REJECTED01" } });
    fireEvent.click(screen.getByRole("button", { name: "Track" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Complaint rejected");
    expect(screen.getByText("Current status:").parentElement).toHaveTextContent("rejected");
    expect(screen.queryByText(/rejection reason/i)).not.toBeInTheDocument();
  });

  it("renders an unassigned officer complaint as a restricted summary", async () => {
    vi.mocked(api.getSession).mockResolvedValueOnce(staffSession);
    vi.mocked(api.listOfficerIssues).mockResolvedValueOnce({
      data: [{ reference: "RF-AG-AB12CD34", status: "submitted", category: "pothole", wardId: "ward-1", submittedAt: "2026-01-01T00:00:00Z" }],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    render(<AuthProvider><MemoryRouter><OfficerPage /></MemoryRouter></AuthProvider>);
    expect(await screen.findByText(/RF-AG-AB12CD34/)).toBeInTheDocument();
    expect(screen.getByText(/pothole.*Ward ward-1/)).toBeInTheDocument();
    expect(screen.getByText(/Restricted summary shown/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show reporter contact" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load private photos" })).not.toBeInTheDocument();
    expect(screen.queryByText(/secret description|rejection note|resolution note/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Navigate to pothole" })).not.toBeInTheDocument();
  });

  it("calculates dashboard analytics from all six fetched complaint statuses", async () => {
    vi.mocked(api.getSession).mockResolvedValueOnce(staffSession);
    const statuses = ["submitted", "under_review", "verified", "in_progress", "resolved", "rejected"] as const;
    vi.mocked(api.listOfficerIssues).mockResolvedValueOnce({
      data: statuses.map((status, index) => ({
        reference: `RF-AG-STATUS${index}`,
        status,
        category: "pothole",
        wardId: "ward-1",
        submittedAt: "2026-01-01T00:00:00Z",
      })),
      total: statuses.length,
      page: 1,
      pageSize: 50,
    });

    render(<AuthProvider><MemoryRouter><OfficerPage /></MemoryRouter></AuthProvider>);

    expect(await screen.findByText(/RF-AG-STATUS0/)).toBeInTheDocument();
    const expectStat = (label: string, value: number) => {
      const card = screen.getAllByText(label)[0]?.closest(".rounded-xl");
      expect(card).toHaveTextContent(String(value));
    };
    expectStat("Total Complaints", 6);
    expectStat("Pending Complaints", 3);
    expectStat("In Progress", 1);
    expectStat("Resolved", 1);
  });

  it("shows zero dashboard analytics for an empty complaint list", async () => {
    vi.mocked(api.getSession).mockResolvedValueOnce(staffSession);
    vi.mocked(api.listOfficerIssues).mockResolvedValueOnce({ data: [], total: 0, page: 1, pageSize: 50 });

    render(<AuthProvider><MemoryRouter><OfficerPage /></MemoryRouter></AuthProvider>);

    expect(await screen.findByText("No complaints are available in your ward.")).toBeInTheDocument();
    expect(screen.getByText("Total Complaints").closest(".rounded-xl")).toHaveTextContent("0");
    expect(screen.getByText("Pending Complaints").closest(".rounded-xl")).toHaveTextContent("0");
    expect(screen.getAllByText("In Progress")[0]?.closest(".rounded-xl")).toHaveTextContent("0");
    expect(screen.getAllByText("Resolved")[0]?.closest(".rounded-xl")).toHaveTextContent("0");
  });

  it("searches complaint references, IDs and descriptions as the officer types", async () => {
    vi.mocked(api.getSession).mockResolvedValueOnce(staffSession);
    vi.mocked(api.listOfficerIssues).mockResolvedValueOnce({
      data: [
        complaint({ id: "complaint-1", reference: "RF-AG-ONE00001", status: "submitted" }),
        complaint({ id: "complaint-2", reference: "RF-AG-TWO00002", status: "resolved", title: "Broken curb", description: "Cracked curb beside the park" }),
      ], total: 2, page: 1, pageSize: 50,
    });
    render(<AuthProvider><MemoryRouter><OfficerPage /></MemoryRouter></AuthProvider>);
    expect(await screen.findByText(/RF-AG-ONE00001/)).toBeInTheDocument();

    const search = screen.getByRole("textbox", { name: "Search complaints" });
    fireEvent.change(search, { target: { value: "complaint-2" } });
    expect(screen.getByText(/RF-AG-TWO00002/)).toBeInTheDocument();
    expect(screen.queryByText(/RF-AG-ONE00001/)).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "crater near" } });
    expect(screen.getByText(/RF-AG-ONE00001/)).toBeInTheDocument();
    expect(screen.queryByText(/RF-AG-TWO00002/)).not.toBeInTheDocument();
  });

  it("filters by status and severity individually", async () => {
    vi.mocked(api.getSession).mockResolvedValueOnce(staffSession);
    vi.mocked(api.listOfficerIssues).mockResolvedValueOnce({
      data: [
        complaint({ id: "complaint-1", reference: "RF-AG-ONE00001", status: "submitted", severity: "high" }),
        complaint({ id: "complaint-2", reference: "RF-AG-TWO00002", status: "resolved", severity: "low", title: "Broken curb" }),
      ], total: 2, page: 1, pageSize: 50,
    });
    render(<AuthProvider><MemoryRouter><OfficerPage /></MemoryRouter></AuthProvider>);
    expect(await screen.findByText(/RF-AG-ONE00001/)).toBeInTheDocument();

    const status = screen.getByRole("combobox", { name: "Filter by status" });
    fireEvent.change(status, { target: { value: "resolved" } });
    expect(screen.getByText(/RF-AG-TWO00002/)).toBeInTheDocument();
    expect(screen.queryByText(/RF-AG-ONE00001/)).not.toBeInTheDocument();

    fireEvent.change(status, { target: { value: "all" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by severity" }), { target: { value: "high" } });
    expect(screen.getByText(/RF-AG-ONE00001/)).toBeInTheDocument();
    expect(screen.queryByText(/RF-AG-TWO00002/)).not.toBeInTheDocument();
  });

  it("combines filters, clears them, and shows an empty state for no matches", async () => {
    vi.mocked(api.getSession).mockResolvedValueOnce(staffSession);
    vi.mocked(api.listOfficerIssues).mockResolvedValueOnce({
      data: [
        complaint({ id: "complaint-1", reference: "RF-AG-ONE00001", status: "submitted", severity: "high" }),
        complaint({ id: "complaint-2", reference: "RF-AG-TWO00002", status: "submitted", severity: "low", description: "Broken curb beside the park" }),
        complaint({ id: "complaint-3", reference: "RF-AG-THREE0003", status: "resolved", severity: "high", description: "Old crater near school" }),
      ], total: 3, page: 1, pageSize: 50,
    });
    render(<AuthProvider><MemoryRouter><OfficerPage /></MemoryRouter></AuthProvider>);
    expect(await screen.findByText(/RF-AG-ONE00001/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Filter by status" }), { target: { value: "submitted" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by severity" }), { target: { value: "high" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Search complaints" }), { target: { value: "school" } });
    expect(screen.getByText(/RF-AG-ONE00001/)).toBeInTheDocument();
    expect(screen.queryByText(/RF-AG-TWO00002/)).not.toBeInTheDocument();
    expect(screen.queryByText(/RF-AG-THREE0003/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Search complaints" }), { target: { value: "no such road" } });
    expect(screen.getByText("No complaints match your filters.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by submission date" }), { target: { value: "last_7_days" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]!);
    expect(screen.getByRole("combobox", { name: "Filter by submission date" })).toHaveValue("all");
    expect(screen.getByText(/RF-AG-ONE00001/)).toBeInTheDocument();
    expect(screen.getByText(/RF-AG-TWO00002/)).toBeInTheDocument();
    expect(screen.getByText(/RF-AG-THREE0003/)).toBeInTheDocument();
  });

  it("supports all four sorting options and displays severity priority badges", async () => {
    vi.mocked(api.getSession).mockResolvedValueOnce(staffSession);
    vi.mocked(api.listOfficerIssues).mockResolvedValueOnce({
      data: [
        complaint({ id: "high-old", reference: "RF-AG-HIGHOLD01", status: "submitted", severity: "high", createdAt: "2026-01-01T00:00:00Z" }),
        complaint({ id: "medium-old", reference: "RF-AG-MEDOLD001", status: "submitted", severity: "medium", createdAt: "2026-01-02T00:00:00Z" }),
        complaint({ id: "low-new", reference: "RF-AG-LOWNEW001", status: "submitted", severity: "low", createdAt: "2026-01-05T00:00:00Z" }),
        complaint({ id: "high-new", reference: "RF-AG-HIGHNEW01", status: "submitted", severity: "high", createdAt: "2026-01-04T00:00:00Z" }),
      ], total: 4, page: 1, pageSize: 50,
    });
    render(<AuthProvider><MemoryRouter><OfficerPage /></MemoryRouter></AuthProvider>);
    expect(await screen.findByText(/RF-AG-HIGHOLD01/)).toBeInTheDocument();
    const displayedReferences = () => screen.getAllByRole("link", { name: "Public tracking view" }).map((link) =>
      new URL(link.getAttribute("href")!, window.location.href).searchParams.get("q")
    );
    expect(displayedReferences()).toEqual(["RF-AG-LOWNEW001", "RF-AG-HIGHNEW01", "RF-AG-MEDOLD001", "RF-AG-HIGHOLD01"]);
    expect(screen.getAllByText("Critical")).toHaveLength(2);
    expect(screen.getByText("Moderate")).toBeInTheDocument();
    expect(screen.getByText("Normal")).toBeInTheDocument();

    const sorting = screen.getByRole("combobox", { name: "Sort complaints" });
    fireEvent.change(sorting, { target: { value: "oldest" } });
    expect(displayedReferences()).toEqual(["RF-AG-HIGHOLD01", "RF-AG-MEDOLD001", "RF-AG-HIGHNEW01", "RF-AG-LOWNEW001"]);
    fireEvent.change(sorting, { target: { value: "highest_severity" } });
    expect(displayedReferences()).toEqual(["RF-AG-HIGHNEW01", "RF-AG-HIGHOLD01", "RF-AG-MEDOLD001", "RF-AG-LOWNEW001"]);
    fireEvent.change(sorting, { target: { value: "lowest_severity" } });
    expect(displayedReferences()).toEqual(["RF-AG-LOWNEW001", "RF-AG-MEDOLD001", "RF-AG-HIGHNEW01", "RF-AG-HIGHOLD01"]);
  });

  it("sorts missing and invalid submission dates safely after valid dates", () => {
    const newest = complaint({ id: "newest", reference: "RF-AG-NEWEST001", status: "submitted", createdAt: "2026-01-05T00:00:00Z" });
    const oldest = complaint({ id: "oldest", reference: "RF-AG-OLDEST001", status: "submitted", createdAt: "2026-01-01T00:00:00Z" });
    const missing = { ...complaint({ id: "missing", reference: "RF-AG-MISSING01", status: "submitted" }) } as Partial<OperationalIssue>;
    delete missing.createdAt;
    const invalid = complaint({ id: "invalid", reference: "RF-AG-INVALID01", status: "submitted", createdAt: "not-a-date" });
    const issues = [oldest, missing as OfficerIssue, invalid, newest];

    expect(sortOfficerIssues(issues, "newest").map((issue) => issue.reference)).toEqual([
      newest.reference, oldest.reference, missing.reference, invalid.reference,
    ]);
    expect(sortOfficerIssues(issues, "oldest").map((issue) => issue.reference)).toEqual([
      oldest.reference, newest.reference, missing.reference, invalid.reference,
    ]);
  });

  it("filters all four date ranges using local calendar boundaries", () => {
    const now = new Date(2026, 5, 10, 15, 30, 0);
    const localMidnight = (daysOffset: number) => {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      date.setDate(date.getDate() + daysOffset);
      return date;
    };
    const makeIssue = (id: string, createdAt: string) => complaint({
      id, reference: `RF-AG-${id.toUpperCase()}`, status: "submitted", createdAt,
    });
    const todayStart = localMidnight(0);
    const tomorrowStart = localMidnight(1);
    const sevenDayStart = localMidnight(-6);
    const thirtyDayStart = localMidnight(-29);
    const issues = {
      todayStart: makeIssue("today-start", todayStart.toISOString()),
      justBeforeToday: makeIssue("before-today", new Date(todayStart.getTime() - 1).toISOString()),
      tomorrowStart: makeIssue("tomorrow-start", tomorrowStart.toISOString()),
      sevenDayStart: makeIssue("seven-start", sevenDayStart.toISOString()),
      justBeforeSeven: makeIssue("before-seven", new Date(sevenDayStart.getTime() - 1).toISOString()),
      thirtyDayStart: makeIssue("thirty-start", thirtyDayStart.toISOString()),
      justBeforeThirty: makeIssue("before-thirty", new Date(thirtyDayStart.getTime() - 1).toISOString()),
      dateOnlyToday: makeIssue("date-only", `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`),
      invalid: makeIssue("invalid-date", "invalid-date"),
    };

    expect(isWithinComplaintDateRange(issues.todayStart, "today", now)).toBe(true);
    expect(isWithinComplaintDateRange(issues.justBeforeToday, "today", now)).toBe(false);
    expect(isWithinComplaintDateRange(issues.tomorrowStart, "today", now)).toBe(false);
    expect(isWithinComplaintDateRange(issues.dateOnlyToday, "today", now)).toBe(true);
    expect(isWithinComplaintDateRange(issues.sevenDayStart, "last_7_days", now)).toBe(true);
    expect(isWithinComplaintDateRange(issues.justBeforeSeven, "last_7_days", now)).toBe(false);
    expect(isWithinComplaintDateRange(issues.thirtyDayStart, "last_30_days", now)).toBe(true);
    expect(isWithinComplaintDateRange(issues.justBeforeThirty, "last_30_days", now)).toBe(false);
    expect(isWithinComplaintDateRange(issues.invalid, "all", now)).toBe(true);
    expect(isWithinComplaintDateRange(issues.invalid, "today", now)).toBe(false);
  });

  it("applies date range together with search, status and severity, and clears it", async () => {
    vi.mocked(api.getSession).mockResolvedValueOnce(staffSession);
    vi.mocked(api.listOfficerIssues).mockResolvedValueOnce({
      data: [
        complaint({ id: "today", reference: "RF-AG-TODAY0001", status: "submitted", severity: "high", description: "Road damage near park", createdAt: daysAgo(0) }),
        complaint({ id: "yesterday", reference: "RF-AG-YESTERDAY1", status: "under_review", severity: "medium", description: "Road damage by school", createdAt: daysAgo(1) }),
        complaint({ id: "twenty-days", reference: "RF-AG-TWENTY001", status: "resolved", severity: "low", description: "Road damage in market", createdAt: daysAgo(20) }),
        complaint({ id: "forty-days", reference: "RF-AG-FORTY0001", status: "rejected", severity: "medium", description: "Road damage on bridge", createdAt: daysAgo(40) }),
        complaint({ id: "missing", reference: "RF-AG-MISSING001", status: "submitted", severity: "low", description: "Road damage on lane", createdAt: "invalid-date" }),
      ], total: 5, page: 1, pageSize: 50,
    });
    render(<AuthProvider><MemoryRouter><OfficerPage /></MemoryRouter></AuthProvider>);
    expect(await screen.findByText(/RF-AG-TODAY0001/)).toBeInTheDocument();
    const references = () => screen.getAllByRole("link", { name: "Public tracking view" }).map((link) =>
      new URL(link.getAttribute("href")!, window.location.href).searchParams.get("q")
    );
    const dateRange = screen.getByRole("combobox", { name: "Filter by submission date" });
    expect(dateRange).toHaveValue("all");
    fireEvent.change(dateRange, { target: { value: "today" } });
    expect(references()).toEqual(["RF-AG-TODAY0001"]);
    fireEvent.change(dateRange, { target: { value: "last_7_days" } });
    expect(references()).toHaveLength(2);
    fireEvent.change(dateRange, { target: { value: "last_30_days" } });
    expect(references()).toHaveLength(3);

    fireEvent.change(screen.getByRole("textbox", { name: "Search complaints" }), { target: { value: "road damage" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by status" }), { target: { value: "under_review" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by severity" }), { target: { value: "medium" } });
    fireEvent.change(dateRange, { target: { value: "last_7_days" } });
    expect(references()).toEqual(["RF-AG-YESTERDAY1"]);

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(dateRange).toHaveValue("all");
    expect(references()).toHaveLength(5);
  });

  it("builds CSV rows with escaped commas, quotes and line breaks without private fields", () => {
    const issue = complaint({
      id: "complaint-csv",
      reference: "RF-AG-CSV00001",
      status: "submitted",
      title: 'Pothole, "deep"',
      description: 'Large hole, reported by citizen\nnear "market"',
      locationDescription: 'Market Road, "north" block',
      severity: "high",
    });

    const csv = buildComplaintsCsv([issue]);

    expect(csv).toContain('"Complaint ID","Title","Category","Description","Location","Severity","Status","Submission date"');
    expect(csv).toContain('"RF-AG-CSV00001","Pothole, ""deep""","pothole","Large hole, reported by citizen\nnear ""market""","Market Road, ""north"" block","high","submitted","2026-01-01T00:00:00Z"');
    expect(csv).not.toMatch(/reporterContact|reporterName|password|session/i);
  });

  it("exports all complaints and only the currently filtered complaints", async () => {
    vi.mocked(api.getSession).mockResolvedValueOnce(staffSession);
    vi.mocked(api.listOfficerIssues).mockResolvedValueOnce({
      data: [
        complaint({ id: "complaint-1", reference: "RF-AG-ONE00001", status: "submitted", severity: "high", createdAt: daysAgo(0) }),
        complaint({ id: "complaint-2", reference: "RF-AG-TWO00002", status: "resolved", severity: "low", title: "Broken curb", createdAt: daysAgo(20) }),
        complaint({ id: "complaint-3", reference: "RF-AG-THREE0003", status: "resolved", severity: "high", title: "Curb damage at market", createdAt: daysAgo(5) }),
        complaint({ id: "complaint-4", reference: "RF-AG-FOUR00004", status: "resolved", severity: "high", title: "Old curb damage", createdAt: daysAgo(40) }),
      ], total: 4, page: 1, pageSize: 50,
    });
    const createdBlobs: Blob[] = [];
    const originalCreate = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    const originalRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((blob: Blob) => { createdBlobs.push(blob); return "blob:roadfix-test"; }),
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const readBlob = (blob: Blob) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    const downloadedLink: { current: HTMLAnchorElement | null } = { current: null };
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      downloadedLink.current = document.querySelector<HTMLAnchorElement>("a[download]");
    });
    try {
      render(<AuthProvider><MemoryRouter><OfficerPage /></MemoryRouter></AuthProvider>);
      expect(await screen.findByText(/RF-AG-ONE00001/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
      expect(downloadedLink.current?.download).toMatch(/^roadfix-complaints-\d{4}-\d{2}-\d{2}\.csv$/);
      const allCsv = await readBlob(createdBlobs[0]!);
      expect(allCsv).toContain("RF-AG-ONE00001");
      expect(allCsv).toContain("RF-AG-TWO00002");
      expect(allCsv).toContain("RF-AG-THREE0003");
      expect(allCsv).toContain("RF-AG-FOUR00004");

      fireEvent.change(screen.getByRole("combobox", { name: "Filter by status" }), { target: { value: "resolved" } });
      fireEvent.change(screen.getByRole("combobox", { name: "Sort complaints" }), { target: { value: "highest_severity" } });
      fireEvent.change(screen.getByRole("textbox", { name: "Search complaints" }), { target: { value: "curb" } });
      fireEvent.change(screen.getByRole("combobox", { name: "Filter by submission date" }), { target: { value: "last_30_days" } });
      const displayed = screen.getAllByRole("link", { name: "Public tracking view" }).map((link) =>
        new URL(link.getAttribute("href")!, window.location.href).searchParams.get("q")
      );
      expect(displayed).toEqual(["RF-AG-THREE0003", "RF-AG-TWO00002"]);
      fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
      const filteredCsv = await readBlob(createdBlobs[1]!);
      expect(filteredCsv).toContain("RF-AG-TWO00002");
      expect(filteredCsv).toContain("RF-AG-THREE0003");
      expect(filteredCsv).not.toContain("RF-AG-ONE00001");
      expect(filteredCsv).not.toContain("RF-AG-FOUR00004");
      expect(filteredCsv.indexOf("RF-AG-THREE0003")).toBeLessThan(filteredCsv.indexOf("RF-AG-TWO00002"));
    } finally {
      clickSpy.mockRestore();
      if (originalCreate) Object.defineProperty(URL, "createObjectURL", originalCreate);
      else Reflect.deleteProperty(URL, "createObjectURL");
      if (originalRevoke) Object.defineProperty(URL, "revokeObjectURL", originalRevoke);
      else Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });

  it("disables CSV export when there are no complaints or no matches", async () => {
    vi.mocked(api.getSession).mockResolvedValueOnce(staffSession);
    vi.mocked(api.listOfficerIssues).mockResolvedValueOnce({ data: [], total: 0, page: 1, pageSize: 50 });
    render(<AuthProvider><MemoryRouter><OfficerPage /></MemoryRouter></AuthProvider>);
    expect(await screen.findByText("No complaints are available in your ward.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
  });

  it("adds a directions link after public tracking using this report's latitude and longitude", async () => {
    vi.mocked(api.getSession).mockResolvedValueOnce(staffSession);
    const issue: OperationalIssue = {
      id: "issue-1",
      reference: "RF-AG-AB12CD34",
      title: "Pothole on Agra Road",
      description: "A pothole is present on this road.",
      category: "pothole",
      status: "submitted",
      severity: "high",
      wardId: "ward-1",
      locationDescription: "Agra Road",
      lat: 27.18,
      lng: 78.02,
      assignedOfficerId: "officer-1",
      assignedAt: null,
      rejectionReason: null,
      resolutionNote: null,
      resolvedAt: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    vi.mocked(api.listOfficerIssues).mockResolvedValueOnce({ data: [issue], total: 1, page: 1, pageSize: 50 });

    render(<AuthProvider><MemoryRouter><OfficerPage /></MemoryRouter></AuthProvider>);

    const tracking = await screen.findByRole("link", { name: "Public tracking view" });
    const navigate = screen.getByRole("link", { name: "Navigate to pothole" });
    expect(tracking.compareDocumentPosition(navigate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(navigate).toHaveAttribute("href", "https://www.google.com/maps/dir/?api=1&destination=27.18%2C78.02&travelmode=driving");
    expect(navigate).toHaveAttribute("target", "_blank");
    expect(navigate).toHaveAttribute("rel", "noopener noreferrer");
    expect(fireEvent.click(navigate)).toBe(true);
    expect(navigate.getAttribute("href")).not.toContain("origin=");
  });

  it("shows navigation for zero coordinates and hides it for invalid coordinates", async () => {
    vi.mocked(api.getSession).mockResolvedValueOnce(staffSession);
    const valid: OperationalIssue = {
      id: "zero-issue", reference: "RF-AG-ZERO0000", title: "Zero point pothole", description: "Pothole at zero coordinates.",
      category: "pothole", status: "submitted", severity: null, wardId: "ward-1", locationDescription: null,
      lat: 0, lng: 0, assignedOfficerId: "officer-1", assignedAt: null, rejectionReason: null,
      resolutionNote: null, resolvedAt: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    };
    const base = { ...valid, id: "invalid-issue", reference: "RF-AG-INVALID00" };
    const missingLatitude: Partial<OperationalIssue> = { ...base };
    delete missingLatitude.lat;
    const missingLongitude: Partial<OperationalIssue> = { ...base };
    delete missingLongitude.lng;
    const malformed = [
      { ...base, lat: null },
      { ...base, lat: undefined },
      missingLatitude,
      { ...base, lat: "" },
      { ...base, lat: "27.18" },
      { ...base, lat: Number.NaN },
      { ...base, lng: null },
      { ...base, lng: undefined },
      missingLongitude,
      { ...base, lng: "78.02" },
      { ...base, lng: Number.POSITIVE_INFINITY },
      { ...base, lat: -90.01 },
      { ...base, lng: 180.01 },
    ] as unknown as OfficerIssue[];
    const malformedIssues = malformed.map((issue, index) => ({
      ...issue,
      id: `invalid-${index}`,
      reference: `RF-AG-INVALID${index}`,
    }));
    vi.mocked(api.listOfficerIssues).mockResolvedValueOnce({ data: [valid, ...malformedIssues], total: 1 + malformed.length, page: 1, pageSize: 50 });

    render(<AuthProvider><MemoryRouter><OfficerPage /></MemoryRouter></AuthProvider>);

    const navigationLinks = await screen.findAllByRole("link", { name: "Navigate to pothole" });
    expect(navigationLinks).toHaveLength(1);
    expect(navigationLinks[0]).toHaveAttribute("href", "https://www.google.com/maps/dir/?api=1&destination=0%2C0&travelmode=driving");
  });

  it("keeps reporter fields optional for anonymous submission and nested pagination", async () => {
    const anonymous = {
      wardId: "ward-1",
      category: "pothole" as const,
      description: "Large pothole on the road",
      lat: 27.18,
      lng: 78.02,
    };
    expect(anonymous).not.toHaveProperty("reporterContact");
    vi.mocked(api.listIssues).mockResolvedValueOnce({ data: [], total: 0, page: 1, pageSize: 20 });
    await expect(api.listIssues({ page: 1, pageSize: 20 })).resolves.toEqual({
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
  });
});
