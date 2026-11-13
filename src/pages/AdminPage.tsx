import { useEffect, useState } from "react";
import {
  api,
  type AdminAccount,
  type AuditEntry,
  type Ward,
  type OperationalIssue,
  type UserRole,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/useAuth";

export function AdminPage() {
  const { user, logout } = useAuth();
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [issues, setIssues] = useState<OperationalIssue[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("officer");
  const [wardId, setWardId] = useState("");
  const [wardName, setWardName] = useState("");
  const [wardCode, setWardCode] = useState("");
  const [wardNumber, setWardNumber] = useState("");
  const [wardLat, setWardLat] = useState("27.18");
  const [wardLng, setWardLng] = useState("78.02");
  const load = async () => {
    try {
      const [a, w, i, l] = await Promise.all([
        api.listAdminAccounts(),
        api.listWards(),
        api.listIssues({ page: 1, pageSize: 50 }),
        api.listAdminAudit(),
      ]);
      setAccounts(a);
      setWards(w);
      setIssues(i.data);
      setAudit(l);
      setError("");
    } catch {
      setError("Could not load administrator data. Check your connection or sign in again.");
    }
  };
  useEffect(() => {
    void load();
  }, []);
  async function act(fn: () => Promise<unknown>, message: string) {
    try {
      await fn();
      setNotice(message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  }
  return (
    <section className="mx-auto max-w-6xl space-y-5 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Administrator dashboard</h1>
          <p>Signed in as {user?.displayName || user?.id}</p>
        </div>
        <Button variant="outline" onClick={() => void logout()}>
          Log out
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-green-700">
          {notice}
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Create staff account</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void act(
                () =>
                  api.createStaffAccount({
                    email,
                    password,
                    displayName: name,
                    role,
                    ...(role === "officer" ? { wardId } : {}),
                  }),
                "Staff account created"
              ).then(() => {
                setEmail("");
                setPassword("");
                setName("");
              });
            }}
          >
            <Input
              required
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              required
              minLength={12}
              type="password"
              placeholder="Initial password (12+ characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Input
              required
              placeholder="Display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select
              className="input"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
            >
              <option value="officer">Officer</option>
              <option value="admin">Administrator</option>
            </select>
            {role === "officer" && (
              <select
                required
                className="input"
                value={wardId}
                onChange={(e) => setWardId(e.target.value)}
              >
                <option value="">Select ward</option>
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}
            <Button>Create account</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Create ward</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 md:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              void act(
                () =>
                  api.createWard({
                    name: wardName,
                    code: wardCode,
                    wardNumber,
                    lat: Number(wardLat),
                    lng: Number(wardLng),
                  }),
                "Ward created"
              ).then(() => {
                setWardName("");
                setWardCode("");
                setWardNumber("");
              });
            }}
          >
            <Input
              required
              placeholder="Ward name"
              value={wardName}
              onChange={(e) => setWardName(e.target.value)}
            />
            <Input
              required
              placeholder="Code"
              value={wardCode}
              onChange={(e) => setWardCode(e.target.value)}
            />
            <Input
              required
              placeholder="Ward number"
              value={wardNumber}
              onChange={(e) => setWardNumber(e.target.value)}
            />
            <Input
              required
              type="number"
              step="any"
              min="-90"
              max="90"
              aria-label="Ward latitude"
              placeholder="Latitude"
              value={wardLat}
              onChange={(e) => setWardLat(e.target.value)}
            />
            <Input
              required
              type="number"
              step="any"
              min="-180"
              max="180"
              aria-label="Ward longitude"
              placeholder="Longitude"
              value={wardLng}
              onChange={(e) => setWardLng(e.target.value)}
            />
            <Button>Create ward</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Staff accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {accounts.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b pb-3"
            >
              <span>
                {a.displayName} · {a.email} · {a.role} · {a.wardId || "No ward"} ·{" "}
                {a.active ? "Active" : "Inactive"}
              </span>
              <div className="flex gap-2">
                {a.role === "officer" && (
                  <select
                    aria-label={`Ward for ${a.email}`}
                    className="input"
                    value={a.wardId ?? ""}
                    onChange={(e) =>
                      void act(
                        () => api.setOfficerWard(a.id, e.target.value || null),
                        "Officer ward updated"
                      )
                    }
                  >
                    <option value="">No ward</option>
                    {wards.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={a.id === user?.id}
                  onClick={() =>
                    void act(() => api.setAccountActive(a.id, !a.active), "Account updated")
                  }
                >
                  {a.active ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Complaint assignment and reopening</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {issues.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-2 border-b pb-3">
              <span className="min-w-48 flex-1">
                {i.reference} · {i.status} · {i.title}
              </span>
              <select
                aria-label={`Assign ${i.reference}`}
                className="input"
                value={i.assignedOfficerId ?? ""}
                onChange={(e) =>
                  e.target.value &&
                  void act(() => api.assignIssue(i.id, e.target.value), "Complaint assigned")
                }
              >
                <option value="">Select officer</option>
                {accounts
                  .filter((a) => a.role === "officer" && a.active && a.wardId === i.wardId)
                  .map((a) => (
                    <option key={a.officerId} value={a.officerId!}>
                      {a.displayName}
                    </option>
                  ))}
              </select>
              {["resolved", "rejected"].includes(i.status) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void act(
                      () =>
                        api.transitionIssue(i.id, {
                          status: "under_review",
                          note: "Reopened by administrator",
                        }),
                      "Complaint reopened"
                    )
                  }
                >
                  Reopen
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recent audit events</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {audit.map((a) => (
            <p key={a.id} className="text-sm">
              {new Date(a.createdAt).toLocaleString()} · {a.actorName ?? a.actorRole} · {a.action}{" "}
              {a.targetComplaintId ? `· ${a.targetComplaintId}` : ""}
            </p>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
