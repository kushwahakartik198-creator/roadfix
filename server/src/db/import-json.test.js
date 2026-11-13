import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { openDatabase } from "./database.js";
import { analyzeJsonStore, applyImportPlan, createJsonBackup } from "./import-json.js";

function sampleStore() {
  return {
    wards: [
      {
        id: "ward-test",
        code: "W001",
        name: "Test Ward",
        description: "Central roads",
        lat: 27.18,
        lng: 78.02,
        wardNumber: "1",
        active: true,
        createdAt: "2026-11-10T00:00:00.000Z",
      },
    ],
    officers: [
      {
        id: "officer-test",
        name: "Private Test Name",
        email: "private@example.test",
        phone: "9999999999",
        wardId: "ward-test",
        active: true,
        createdAt: "2026-11-10T00:00:00.000Z",
      },
    ],
    issues: [
      {
        id: "issue-test",
        reference: "RF-AG-ABCDEFGH",
        title: "Pothole at test road",
        description: "A sufficiently detailed test report.",
        category: "pothole",
        status: "reported",
        severity: "medium",
        wardId: "ward-test",
        locationDescription: "Test Road",
        lat: 27.18,
        lng: 78.02,
        reporterName: "Private Reporter",
        reporterContact: "9999999999",
        assignedOfficerId: "officer-test",
        rejectionReason: null,
        resolutionNote: null,
        resolvedAt: null,
        photoUrl: "/uploads/private.jpg",
        createdAt: "2026-11-10T00:00:00.000Z",
        updatedAt: "2026-11-10T00:00:00.000Z",
      },
      {
        id: "issue-critical",
        reference: "RF-AG-ABCDEFGJ",
        title: "Critical test issue",
        description: "A sufficiently detailed test report.",
        category: "pothole",
        status: "verified",
        severity: "critical",
        wardId: "ward-test",
        locationDescription: null,
        lat: 27.18,
        lng: 78.02,
        reporterName: "Withheld",
        reporterContact: null,
        assignedOfficerId: null,
        rejectionReason: null,
        resolutionNote: null,
        resolvedAt: null,
        photoUrl: null,
        createdAt: "2026-11-10T00:00:00.000Z",
        updatedAt: "2026-11-10T00:00:00.000Z",
      },
    ],
    history: [
      {
        id: "history-test",
        issueId: "issue-test",
        eventType: "created",
        fromStatus: null,
        toStatus: "reported",
        actorId: "legacy-person",
        actorRole: "citizen",
        note: "No contact details copied",
        createdAt: "2026-11-10T00:00:00.000Z",
      },
    ],
  };
}

const SERVER_ROOT = fileURLToPath(new URL("../../", import.meta.url));

function createFixture(t, prefix) {
  const directory = mkdtempSync(join(SERVER_ROOT, prefix));
  const connections = new Set();
  const open = (dbPath = join(directory, "test.sqlite")) => {
    const db = openDatabase({ dbPath });
    connections.add(db);
    return db;
  };
  t.after(() => {
    for (const db of connections) if (db.open) db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { directory, open };
}

test("JSON dry-run maps statuses and withholds personal data without opening a database", () => {
  const plan = analyzeJsonStore(sampleStore());
  assert.equal(plan.rows.wards.length, 1);
  assert.equal(plan.rows.complaints.length, 1);
  assert.equal(plan.rows.complaints[0].status, "submitted");
  assert.equal(plan.rows.complaints[0].reporterId, null);
  assert.equal("reporterName" in plan.rows.complaints[0], false);
  assert.equal("reporterContact" in plan.rows.complaints[0], false);
  assert.equal(plan.rows.complaints[0].assignedOfficerId, null);
  assert.equal(plan.rows.history[0].actorId, null);
  assert.equal(plan.rows.history[0].note, null);
  assert.equal(plan.rejected.officers[0].reason, "withheld_unclassified_personal_data");
  assert.equal(plan.rejected.complaints[0].reason, "unmappable_severity:critical");
  assert.ok(
    plan.warnings.some((warning) => warning.includes("photo references were not imported"))
  );
});

test("JSON dry-run reports likely contacts in free text and invalid records", () => {
  const store = sampleStore();
  store.issues[0].description = "Call 9876543210 about this pothole report.";
  const plan = analyzeJsonStore(store);
  assert.equal(plan.rows.complaints.length, 0);
  assert.equal(plan.rejected.complaints[0].reason, "unclassified_contact_pattern_in_free_text");
});

test("import is transactional and repeat runs detect duplicate rows", (t) => {
  const fixture = createFixture(t, ".roadfix-import-test-");
  const db = fixture.open();
  const plan = analyzeJsonStore(sampleStore());
  const first = applyImportPlan(db, plan);
  assert.deepEqual(first, {
    wards: { imported: 1, duplicate: 0 },
    complaints: { imported: 1, duplicate: 0 },
    history: { imported: 1, duplicate: 0 },
  });
  const second = applyImportPlan(db, plan);
  assert.deepEqual(second, {
    wards: { imported: 0, duplicate: 1 },
    complaints: { imported: 0, duplicate: 1 },
    history: { imported: 0, duplicate: 1 },
  });
  assert.equal(db.prepare("SELECT count(*) AS n FROM complaints").get().n, 1);
});

test("import conflict rolls back the full batch", (t) => {
  const fixture = createFixture(t, ".roadfix-import-conflict-");
  const db = fixture.open();
  const plan = analyzeJsonStore(sampleStore());
  db.prepare(
    `INSERT INTO wards(id,code,name,description,latitude,longitude,ward_number,active,created_at)
    VALUES('ward-test','W001','Test Ward','Central roads',27.18,78.02,'1',1,'2026-11-10T00:00:00.000Z')`
  ).run();
  db.prepare(
    `INSERT INTO complaints(id,reference,title,description,category,status,severity,ward_id,latitude,longitude,
    status_updated_at,created_at,updated_at)
    VALUES('preexisting','RF-AG-ABCDEFGH','Different row','A sufficiently detailed existing report.','pothole','submitted','low',
    'ward-test',27.18,78.02,'2026-11-10T00:00:00.000Z','2026-11-10T00:00:00.000Z','2026-11-10T00:00:00.000Z')`
  ).run();
  const conflicting = plan;
  assert.throws(
    () => applyImportPlan(db, conflicting),
    /Conflicting existing complaint id or reference/
  );
  assert.equal(db.prepare("SELECT count(*) AS n FROM wards").get().n, 1);
  assert.equal(db.prepare("SELECT count(*) AS n FROM complaints").get().n, 1);
});

test("backup creation is exclusive and preserves original JSON bytes", (t) => {
  const directory = mkdtempSync(join(SERVER_ROOT, ".roadfix-import-backup-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = join(directory, "store.json");
  const contents = JSON.stringify(sampleStore());
  writeFileSync(source, contents);
  const backup = createJsonBackup(source);
  assert.notEqual(backup, source);
  assert.equal(readFileSync(backup, "utf8"), contents);
});
