import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { openDatabase } from "../src/db/database.js";
import { createRepository } from "../src/db/repository.js";
import { provisionInitialAdmin, provisionStaffAccount } from "../src/auth/accounts.js";

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const demoRoot = resolve(serverRoot, "data", "hackathon-demo");
const databasePath = resolve(demoRoot, "roadfix-demo.sqlite");
const uploadsRoot = resolve(demoRoot, "uploads");
const credentialsPath = resolve(demoRoot, "credentials.local.dpapi.txt");

if (existsSync(demoRoot) || existsSync(databasePath)) {
  throw new Error(`Refusing to reuse or overwrite demo data at ${demoRoot}. Inspect it and choose a new isolated directory.`);
}
if (resolve(databasePath) === resolve(serverRoot, "data", "roadfix.sqlite")) {
  throw new Error("Demo database path must never be the application default database path");
}

mkdirSync(demoRoot);
try {
  if (process.platform === "win32") {
    const identity = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
    execFileSync("icacls.exe", [demoRoot, "/inheritance:r", "/grant:r", `${identity}:(OI)(CI)(F)`, "*S-1-5-18:(OI)(CI)(F)", "*S-1-5-32-544:(OI)(CI)(F)"], { stdio: "pipe" });
  }
} catch (error) {
  throw new Error(`Could not restrict access to the new demo directory; no database or credentials were created. Path: ${demoRoot}`, { cause: error });
}
mkdirSync(uploadsRoot);

const adminPassword = `RfDemo-${randomBytes(24).toString("base64url")}`;
const officerPassword = `RfDemo-${randomBytes(24).toString("base64url")}`;
const adminEmail = "demo-admin@roadfix-demo.invalid";
const officerEmail = "demo-officer@roadfix-demo.invalid";
let db;
try {
  db = openDatabase({ dbPath: databasePath });
  const admin = await provisionInitialAdmin(db, { email: adminEmail, password: adminPassword, displayName: "Demo Administrator" });
  const repository = createRepository(db);
  const ward = repository.createWard({
    code: "DEMO-AGRA", name: "Synthetic Agra Demo Ward",
    description: "Fictional demonstration ward; not an official municipal boundary.",
    lat: 27.18, lng: 78.02, wardNumber: "DEMO",
  }, { userId: admin.id });
  const officer = await provisionStaffAccount(db, {
    email: officerEmail, password: officerPassword, displayName: "Demo Officer",
    role: "officer", wardId: ward.id, actor: { userId: admin.id, role: "admin" },
  });

  const samples = [
    { road: "Fictional Demo Road Alpha", status: "submitted", severity: "high", assigned: false },
    { road: "Fictional Demo Road Bravo", status: "under_review", severity: "medium", assigned: true },
    { road: "Fictional Demo Road Charlie", status: "verified", severity: "high", assigned: true },
    { road: "Fictional Demo Road Delta", status: "in_progress", severity: "low", assigned: true },
    { road: "Fictional Demo Road Echo", status: "resolved", severity: "medium", assigned: true },
  ];
  for (const sample of samples) {
    const complaint = repository.createComplaint({
      title: `Synthetic pothole — ${sample.road}`,
      description: `Synthetic demonstration report for ${sample.road}. No resident or real road information is represented.`,
      category: "pothole", severity: sample.severity, wardId: ward.id,
      locationDescription: sample.road, lat: 27.18, lng: 78.02,
    });
    if (sample.assigned) repository.assignComplaint(complaint.id, { officerId: officer.officerId, actorId: admin.id, actorRole: "admin" });
    const steps = {
      submitted: [],
      under_review: ["under_review"],
      verified: ["under_review", "verified"],
      in_progress: ["under_review", "verified", "in_progress"],
      resolved: ["under_review", "verified", "in_progress", "resolved"],
    }[sample.status];
    for (const status of steps) {
      repository.updateComplaintStatus(complaint.id, {
        status, ...(status === "resolved" ? { note: "Synthetic demo completion." } : {}),
        actorId: officer.id, actorRole: "officer",
      });
    }
  }

  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#343b43"/><path d="M0 250 Q140 190 250 250 T500 235 T700 250 L700 360 L0 360Z" fill="#24292f"/><ellipse cx="330" cy="275" rx="82" ry="24" fill="#111519"/><text x="24" y="42" fill="white" font-family="sans-serif" font-size="22">SYNTHETIC DEMO IMAGE — NOT A ROAD PHOTO</text></svg>');
  await sharp(svg).png().toFile(resolve(demoRoot, "synthetic-pothole.png"));
  const credentials = [
    "ROADFIX HACKATHON DEMO ONLY — SYNTHETIC LOCAL DATABASE",
    `Database: ${databasePath}`,
    `Uploads: ${uploadsRoot}`,
    "Use only with the isolated hackathon demo launcher. Never copy these credentials into source code or a real deployment.",
    "",
    `Administrator email: ${adminEmail}`,
    `Administrator password: ${adminPassword}`,
    "",
    `Officer email: ${officerEmail}`,
    `Officer password: ${officerPassword}`,
    `Officer ward: ${ward.name} (${ward.code})`,
    "",
  ].join("\n");
  if (process.platform !== "win32") throw new Error("Demo credentials require Windows DPAPI protection; refusing to write plaintext credentials");
  const credentialsPayload = Buffer.from(credentials, "utf8").toString("base64");
  const protectScript = "Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $protected=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($protected))";
  const protectedCredentials = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", protectScript], { input: credentialsPayload, encoding: "utf8" }).trim();
  if (!protectedCredentials || /\s/.test(protectedCredentials)) throw new Error("Windows DPAPI did not return a valid protected credential payload");
  const unprotectScript = "Add-Type -AssemblyName System.Security; $protected=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $bytes=[Security.Cryptography.ProtectedData]::Unprotect($protected,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($bytes))";
  const verifiedPayload = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", unprotectScript], { input: protectedCredentials, encoding: "utf8" }).trim();
  if (Buffer.from(verifiedPayload, "base64").toString("utf8") !== credentials) throw new Error("Windows DPAPI credential round-trip verification failed");
  writeFileSync(credentialsPath, `${protectedCredentials}\n`, { flag: "wx", mode: 0o600 });
  console.log(`Synthetic demo database prepared: ${databasePath}`);
  console.log(`Current-Windows-user DPAPI-protected credentials: ${credentialsPath}`);
  console.log(`Synthetic image for the live report: ${resolve(demoRoot, "synthetic-pothole.png")}`);
  console.log(`Seeded ${samples.length} fictional pothole reports in varied statuses; no personal details.`);
} catch (error) {
  console.error(`Demo preparation did not complete. Partial files were preserved for inspection at ${demoRoot}. Do not delete them until checked.`, error);
  process.exitCode = 1;
} finally {
  if (db?.open) db.close();
}
