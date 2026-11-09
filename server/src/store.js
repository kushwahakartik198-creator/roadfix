/**
 * RoadFix Local Server — In-memory store with snapshot/restore.
 *
 * Zero-dependency. Holds wards, officers, issues, and audit history.
 * The store is persisted to `data/store.json` on every mutation.
 */
export class Store {
  constructor(data) {
    this.data = data;
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.data));
  }

  // ---- Wards ----
  listWards(params = {}) {
    let rows = this.data.wards.slice();
    if (params.q) {
      const q = params.q.toLowerCase();
      rows = rows.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          w.code.toLowerCase().includes(q) ||
          (w.description ?? "").toLowerCase().includes(q)
      );
    }
    if (params.active != null) {
      const active = String(params.active).toLowerCase() === "true";
      rows = rows.filter((w) => w.active === active);
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }

  getWard(id) {
    return this.data.wards.find((w) => w.id === id) ?? null;
  }

  // ---- Officers ----
  listOfficers(params = {}) {
    let rows = this.data.officers.slice();
    if (params.q) {
      const q = params.q.toLowerCase();
      rows = rows.filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          (o.wardId ?? "").toLowerCase().includes(q)
      );
    }
    if (params.wardId) {
      rows = rows.filter((o) => o.wardId === params.wardId);
    }
    if (params.active != null) {
      const active = String(params.active).toLowerCase() === "true";
      rows = rows.filter((o) => o.active === active);
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }

  getOfficer(id) {
    return this.data.officers.find((o) => o.id === id) ?? null;
  }

  // ---- Issues ----
  listIssues(params = {}) {
    let rows = this.data.issues.slice();

    if (params.status) {
      rows = rows.filter((i) => i.status === params.status);
    }
    if (params.wardId) {
      rows = rows.filter((i) => i.wardId === params.wardId);
    }
    if (params.assignedOfficerId) {
      rows = rows.filter((i) => i.assignedOfficerId === params.assignedOfficerId);
    }
    if (params.severity) {
      rows = rows.filter((i) => i.severity === params.severity);
    }
    if (params.category) {
      rows = rows.filter((i) => i.category === params.category);
    }
    if (params.q) {
      const q = params.q.toLowerCase();
      rows = rows.filter(
        (i) =>
          i.description.toLowerCase().includes(q) ||
          (i.locationDescription ?? "").toLowerCase().includes(q) ||
          i.reference.toLowerCase().includes(q)
      );
    }
    if (params.mine) {
      rows = rows.filter((i) => i.reporterId === params.mine);
    }

    const sort = params.sort ?? "createdAt";
    const dir = (params.dir ?? "desc").toLowerCase() === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const av = a[sort] ?? "";
      const bv = b[sort] ?? "";
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });

    const total = rows.length;
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
    const start = (page - 1) * pageSize;
    const paged = rows.slice(start, start + pageSize);

    return { data: paged, total, page, pageSize };
  }

  getIssue(id) {
    return this.data.issues.find((i) => i.id === id) ?? null;
  }

  getIssueByReference(reference) {
    const ref = (reference ?? "").trim().toUpperCase();
    return this.data.issues.find((i) => i.reference === ref) ?? null;
  }

  // ---- Audit ----
  addHistory(record) {
    this.data.history.push(record);
  }
}
