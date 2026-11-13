import { afterEach, describe, expect, it, vi } from "vitest";
import { useEffect, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "@/features/auth/AuthContext";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { LoginPage } from "@/pages/LoginPage";
import { api, setCsrfToken, setSessionExpiredHandler } from "@/lib/api";

const staffSession = {
  user: { id: "officer-1", displayName: "Test Officer", role: "officer" as const, officerId: "officer-1", wardId: "ward-1" },
  csrfToken: "test-csrf",
  expiresAt: "2026-11-11T18:00:00.000Z",
};

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(status < 400 ? { ok: true, data } : { ok: false, error: "Authentication required" }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function CurrentPath() {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname}{location.search}{location.hash}</div>;
}

function renderStaffApp() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/officer?tab=assigned#top"]}>
        <CurrentPath />
        <Routes>
          <Route path="/login" element={<LoginWithReturn />} />
          <Route element={<RequireAuth />}>
            <Route path="/officer" element={<OfficerLoad />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

function LoginWithReturn() {
  const location = useLocation();
  return <><LoginPage /><p data-testid="login-return">{String((location.state as { from?: string } | null)?.from ?? "")}</p></>;
}

function OfficerLoad() {
  const location = useLocation();
  return <OfficerRequest locationKey={`${location.pathname}${location.search}${location.hash}`} />;
}

function OfficerRequest({ locationKey }: { locationKey: string }) {
  const [state, setState] = useState("Loading staff complaints");
  useEffect(() => {
    void api.listIssues().then(() => setState("Officer dashboard ready")).catch((error: { status?: number }) => {
      if (error.status !== 401) setState("Temporary service problem");
    });
  }, [locationKey]);
  return <p>{state}</p>;
}

afterEach(() => {
  cleanup();
  setCsrfToken(null);
  setSessionExpiredHandler(null);
  vi.restoreAllMocks();
});

describe("session expiry recovery", () => {
  it("redirects on protected 401, preserves a safe destination, and returns after login without looping", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(json(200, staffSession));
    fetchMock.mockResolvedValueOnce(json(401, null));
    fetchMock.mockResolvedValueOnce(json(200, staffSession));
    fetchMock.mockResolvedValueOnce(json(200, { data: [], total: 0, page: 1, pageSize: 50 }));
    renderStaffApp();
    expect(await screen.findByText("Your session expired. Sign in again to continue.")).toBeInTheDocument();
    expect(screen.getByTestId("current-path")).toHaveTextContent("/login");
    expect(screen.getByTestId("login-return")).toHaveTextContent("/officer?tab=assigned#top");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "officer@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "synthetic-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Officer dashboard ready")).toBeInTheDocument();
    expect(screen.getByTestId("current-path")).toHaveTextContent("/officer?tab=assigned#top");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not log out on a network failure", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(json(200, staffSession));
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderStaffApp();
    expect(await screen.findByText("Temporary service problem")).toBeInTheDocument();
    expect(screen.getByTestId("current-path")).toHaveTextContent("/officer?tab=assigned#top");
    expect(screen.queryByText("Your session expired. Sign in again to continue.")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not log out on a protected endpoint server error", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(json(200, staffSession));
    fetchMock.mockResolvedValueOnce(json(500, null));
    renderStaffApp();
    expect(await screen.findByText("Temporary service problem")).toBeInTheDocument();
    expect(screen.getByTestId("current-path")).toHaveTextContent("/officer?tab=assigned#top");
    expect(screen.queryByText("Your session expired. Sign in again to continue.")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps public tracking and anonymous submissions outside session expiry handling", async () => {
    const expired = vi.fn();
    setSessionExpiredHandler(expired);
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(200, { reference: "RF-AG-ABCDEFGH", status: "submitted", submittedAt: "2026-11-11T00:00:00.000Z", lastUpdatedAt: "2026-11-11T00:00:00.000Z", locationDescription: null }))
      .mockResolvedValueOnce(json(200, { id: "issue-1", reference: "RF-AG-IJKLMNOP", status: "submitted", title: "Pothole" }));
    await expect(api.trackIssue("RF-AG-ABCDEFGH")).resolves.toMatchObject({ status: "submitted" });
    await expect(api.createIssue({ wardId: "ward-1", category: "pothole", description: "Synthetic anonymous report", lat: 27.18, lng: 78.02 })).resolves.toMatchObject({ status: "submitted" });
    expect(expired).not.toHaveBeenCalled();
  });

  it("rejects an unsafe external return destination", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(401, null))
      .mockResolvedValueOnce(json(200, staffSession));
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={[{ pathname: "/login", state: { from: "//attacker.example/steal" } }]}>
          <Routes><Route path="/login" element={<LoginPage />} /><Route path="/officer" element={<p>Default officer destination</p>} /></Routes>
        </MemoryRouter>
      </AuthProvider>
    );
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "officer@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "synthetic-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Default officer destination")).toBeInTheDocument();
    expect(window.location.pathname).not.toContain("attacker");
  });
});
