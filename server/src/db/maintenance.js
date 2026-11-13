import Database from "better-sqlite3";
import { createReadStream } from "node:fs";
import {
  closeSync,
  copyFileSync,
  existsSync,
  lstatSync,
  constants as fsConstants,
  mkdirSync,
  openSync,
  realpathSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { DEFAULT_DATABASE_PATH, ROADFIX_APPLICATION_ID } from "./database.js";

function openExisting(path, options = {}) {
  return new Database(resolve(path), { fileMustExist: true, timeout: 5000, ...options });
}

export function verifyDatabase(path) {
  const absolute = resolve(path);
  const db = openExisting(absolute, { readonly: true });
  try {
    const appId = db.pragma("application_id", { simple: true });
    if (appId !== ROADFIX_APPLICATION_ID) throw new Error("File is not a RoadFix SQLite database");
    const hasMigrations = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
    if (!hasMigrations) throw new Error("RoadFix migration metadata is missing");
    const integrity = db.pragma("integrity_check");
    if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") {
      throw new Error(`SQLite integrity check failed: ${integrity.map((row) => row.integrity_check).join("; ")}`);
    }
    const foreignKeyErrors = db.pragma("foreign_key_check");
    if (foreignKeyErrors.length) throw new Error(`SQLite foreign-key check failed (${foreignKeyErrors.length} violation(s))`);
    return { path: absolute, integrity: "ok", foreignKeyViolations: 0 };
  } finally {
    db.close();
  }
}

async function createOnlineBackup(sourcePath, destinationPath) {
  const source = openExisting(sourcePath, { readonly: true });
  try {
    return await source.backup(destinationPath);
  } finally {
    source.close();
  }
}

function uniquePath(directory, prefix, suffix = ".sqlite") {
  return resolve(directory, `${prefix}-${randomUUID()}${suffix}`);
}

function removeSqliteFiles(path) {
  for (const candidate of [path, `${path}-wal`, `${path}-shm`]) rmSync(candidate, { force: true });
}

export async function backupDatabase({
  sourcePath = DEFAULT_DATABASE_PATH,
  directory = resolve(dirname(DEFAULT_DATABASE_PATH), "backups"),
  now = new Date(),
} = {}) {
  const source = resolve(sourcePath);
  const outputDir = resolve(directory);
  mkdirSync(outputDir, { recursive: true });
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const destination = resolve(outputDir, `roadfix-${stamp}.sqlite`);
  const temporary = uniquePath(outputDir, ".roadfix-backup", ".tmp.sqlite");
  let committed = false;
  try {
    await createOnlineBackup(source, temporary);
    const verification = verifyDatabase(temporary);
    // COPYFILE_EXCL refuses existing destinations on Windows and POSIX.
    copyFileSync(temporary, destination, fsConstants.COPYFILE_EXCL);
    committed = true;
    removeSqliteFiles(temporary);
    return { path: destination, verification };
  } catch (error) {
    removeSqliteFiles(temporary);
    if (committed) removeSqliteFiles(destination);
    throw error;
  }
}

async function sha256File(path, hashFile = createHash) {
  const hash = hashFile("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function listUploadFiles(root) {
  const files = [];
  function visit(directory, prefix = "") {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const fullPath = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in uploads backup: ${fullPath}`);
      if (entry.isDirectory()) visit(fullPath, relativePath);
      else if (entry.isFile()) files.push({ relativePath, fullPath });
      else throw new Error(`Unsupported upload filesystem entry: ${fullPath}`);
    }
  }
  visit(root);
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "en"));
}

function listExistingPaths(root) {
  const paths = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      paths.push(path);
      if (entry.isDirectory() && !entry.isSymbolicLink()) visit(path);
    }
  }
  if (existsSync(root)) { paths.push(root); if (lstatSync(root).isDirectory()) visit(root); }
  return paths;
}

function isWithinPath(parent, child) {
  let base = resolve(parent);
  let target = resolve(child);
  if (process.platform === "win32") { base = base.toLowerCase(); target = target.toLowerCase(); }
  const path = relative(base, target);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function canonicalFuturePath(path) {
  const resolved = resolve(path);
  let cursor = resolved;
  const missing = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) return resolved;
    missing.unshift(cursor.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)));
    cursor = parent;
  }
  return resolve(realpathSync(cursor), ...missing);
}

export async function verifyBackupSet(setPath, { hashFile = createHash } = {}) {
  const root = resolve(setPath);
  const manifestPath = resolve(root, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const databasePath = resolve(root, manifest.database?.filename ?? "");
  if (!isWithinPath(root, databasePath) || !lstatSync(databasePath).isFile()) throw new Error("Backup-set database file is missing or invalid");
  if (await sha256File(databasePath, hashFile) !== manifest.database.sha256) throw new Error(`Database SHA-256 mismatch: ${databasePath}`);
  if (!Array.isArray(manifest.uploads?.files)) throw new Error("Backup-set upload manifest is invalid");
  const uploadsRoot = resolve(root, "uploads");
  const actualUploadFiles = listUploadFiles(uploadsRoot);
  const actualByPath = new Map(actualUploadFiles.map((file) => [file.relativePath, file.fullPath]));
  let totalBytes = 0;
  const expectedPaths = new Set();
  for (const entry of manifest.uploads.files) {
    if (typeof entry.path !== "string" || !entry.path || entry.path.includes("\\") || entry.path.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`Invalid upload manifest path: ${entry.path}`);
    const uploadPath = actualByPath.get(entry.path);
    if (expectedPaths.has(entry.path)) throw new Error(`Duplicate upload manifest path: ${entry.path}`);
    if (!uploadPath) throw new Error(`Backup-set upload is missing or invalid: ${resolve(uploadsRoot, ...entry.path.split("/"))}`);
    const size = statSync(uploadPath).size;
    const digest = await sha256File(uploadPath, hashFile);
    if (size !== entry.sizeBytes) throw new Error(`Upload size mismatch: ${uploadPath}`);
    if (digest !== entry.sha256) throw new Error(`Upload SHA-256 mismatch: ${uploadPath}`);
    expectedPaths.add(entry.path);
    totalBytes += size;
  }
  if (manifest.uploads.fileCount !== expectedPaths.size || manifest.uploads.totalBytes !== totalBytes) throw new Error("Backup-set upload totals do not match manifest entries");
  const actualFiles = actualUploadFiles.map((file) => file.relativePath);
  if (actualFiles.length !== expectedPaths.size || actualFiles.some((path) => !expectedPaths.has(path))) throw new Error("Backup-set uploads contain files not listed in the manifest");
  return { path: root, databasePath, fileCount: expectedPaths.size, totalBytes };
}

export async function backupSet({
  sourcePath = DEFAULT_DATABASE_PATH,
  uploadsPath,
  directory,
  confirmServerStopped = false,
  now = new Date(),
  fileOps = {},
  verify = verifyBackupSet,
} = {}) {
  if (!confirmServerStopped) throw new Error("Explicit operator attestation required: pass --confirm-server-stopped only after stopping RoadFix and all SQLite writers");
  if (typeof directory !== "string" || !directory.trim()) throw new Error("An explicit backup-set destination directory is required");
  if (typeof uploadsPath !== "string" || !uploadsPath.trim()) throw new Error("An explicit uploads directory is required");
  const source = resolve(sourcePath);
  const uploads = resolve(uploadsPath);
  const destinationRoot = resolve(directory);
  const canonicalDestination = canonicalFuturePath(destinationRoot);
  const canonicalData = canonicalFuturePath(dirname(DEFAULT_DATABASE_PATH));
  const canonicalUploads = canonicalFuturePath(uploads);
  const canonicalSource = canonicalFuturePath(source);
  if (isWithinPath(canonicalData, canonicalDestination)) throw new Error(`Backup-set destination must be outside application writable data directory: ${canonicalData}`);
  if (isWithinPath(canonicalUploads, canonicalDestination) || isWithinPath(canonicalDestination, canonicalUploads)) throw new Error("Backup-set destination and source uploads directories must not overlap");
  if (isWithinPath(canonicalDestination, canonicalSource)) throw new Error("Backup-set destination must not contain the source database");
  if (!existsSync(uploads) || !lstatSync(uploads).isDirectory() || lstatSync(uploads).isSymbolicLink()) throw new Error("Uploads path must be an existing regular directory, not a symbolic link");

  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const setPath = resolve(destinationRoot, `roadfix-backup-set-${stamp}`);
  mkdirSync(destinationRoot, { recursive: true });
  try {
    mkdirSync(setPath);
  } catch (error) {
    throw new Error(`Could not create backup set; no existing set was overwritten. Backup-set path: ${setPath}; cause: ${error.message}`, { cause: error });
  }

  const databaseDirectory = resolve(setPath, "database");
  const uploadsDirectory = resolve(setPath, "uploads");
  try {
    mkdirSync(databaseDirectory);
    mkdirSync(uploadsDirectory);
    const dbBackup = await backupDatabase({ sourcePath: source, directory: databaseDirectory, now });
    const databaseFilename = basename(dbBackup.path);
    const copyFile = fileOps.copyFileSync ?? copyFileSync;
    const uploadFiles = listUploadFiles(uploads);
    const manifestFiles = [];
    for (const file of uploadFiles) {
      const target = resolve(uploadsDirectory, ...file.relativePath.split("/"));
      mkdirSync(dirname(target), { recursive: true });
      copyFile(file.fullPath, target, fsConstants.COPYFILE_EXCL);
      manifestFiles.push({ path: file.relativePath, sizeBytes: statSync(target).size, sha256: await sha256File(target, fileOps.createHash ?? createHash) });
    }
    const databaseSha256 = await sha256File(dbBackup.path, fileOps.createHash ?? createHash);
    const manifest = {
      backupTimestamp: now.toISOString(),
      database: { filename: `database/${databaseFilename}`, sha256: databaseSha256 },
      uploads: {
        files: manifestFiles,
        fileCount: manifestFiles.length,
        totalBytes: manifestFiles.reduce((sum, file) => sum + file.sizeBytes, 0),
      },
    };
    (fileOps.writeFileSync ?? writeFileSync)(resolve(setPath, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
    const verification = await verify(setPath, { hashFile: fileOps.createHash ?? createHash });
    return { path: setPath, databasePath: dbBackup.path, manifestPath: resolve(setPath, "manifest.json"), databaseVerification: dbBackup.verification, verification, manifest };
  } catch (error) {
    let inventory = [];
    let inventoryError = "";
    try { inventory = listExistingPaths(setPath); } catch (failure) { inventoryError = `; backup-set inventory failed: ${failure.message}`; }
    throw new Error(`Backup-set creation failed: ${error.message}; incomplete backup-set path: ${setPath}; existing set paths: ${inventory.join(", ") || "none"}; expected database directory: ${databaseDirectory}; expected uploads directory: ${uploadsDirectory}; manifest path: ${resolve(setPath, "manifest.json")}${inventoryError}`, { cause: error });
  }
}

function assertSafeSidecarState(target) {
  for (const suffix of ["-wal", "-shm"]) {
    const path = `${target}${suffix}`;
    if (existsSync(path) && statSync(path).size > 0) {
      throw new Error(`SQLite ${suffix.slice(1).toUpperCase()} file remains after checkpoint; stop the server and retry`);
    }
  }
}

function sidecars(path) {
  return [`${path}-wal`, `${path}-shm`];
}

function moveIfPresent(from, to, move = renameSync) {
  if (existsSync(from)) {
    moveNoReplace(from, to, move);
  }
}

function moveNoReplace(from, to, move = renameSync) {
  if (existsSync(to)) throw new Error(`Refusing to overwrite existing recovery path: ${to}`);
  move(from, to);
}

function uniqueRecoveryPath(target, id, label, suffix) {
  let candidate;
  do {
    candidate = resolve(dirname(target), `.${basename(target)}.${id}.${label}-${randomUUID()}${suffix}`);
  } while (existsSync(candidate));
  return candidate;
}

export async function restoreDatabase({ backupPath, targetPath = DEFAULT_DATABASE_PATH, confirmOverwrite = false, fileOps = {}, verify = verifyDatabase } = {}) {
  const move = fileOps.renameSync ?? ((from, to) => {
    // Exclusive copy avoids replace-on-POSIX rename behavior and works on
    // Windows filesystems without hard-link support. If unlink fails, both survive.
    (fileOps.copyFileSync ?? copyFileSync)(from, to, fsConstants.COPYFILE_EXCL);
    (fileOps.unlinkSync ?? unlinkSync)(from);
  });
  const remove = fileOps.rmSync ?? rmSync;
  if (typeof backupPath !== "string" || !backupPath.trim()) throw new Error("An explicit backup file path is required");
  const backup = resolve(backupPath);
  const target = resolve(targetPath);
  const samePath = process.platform === "win32"
    ? backup.toLowerCase() === target.toLowerCase()
    : backup === target;
  if (samePath) throw new Error("Backup and target paths must be different");
  const verification = verify(backup);
  mkdirSync(dirname(target), { recursive: true });
  const targetExists = existsSync(target);
  if (targetExists && (!lstatSync(target).isFile() || lstatSync(target).isSymbolicLink())) {
    throw new Error("Restore target must be a regular database file, not a directory or symbolic link");
  }
  if (!targetExists && sidecars(target).some((path) => existsSync(path))) {
    throw new Error("A WAL or SHM sidecar exists without the target database; preserve it and investigate before restoring");
  }
  if (targetExists && !confirmOverwrite) {
    throw new Error("Target database already exists; pass --confirm-overwrite to replace it");
  }

  const id = randomUUID();
  const staged = resolve(dirname(target), `.${basename(target)}.${id}.restore.tmp`);
  const displaced = resolve(dirname(target), `.${basename(target)}.${id}.previous`);
  const displacedSidecars = sidecars(target).map((path) => `${path}.${id}.previous`);
  const stagedSidecars = sidecars(staged);
  let movedOriginal = false;
  let promoted = false;
  let promotionAttempted = false;
  let safetyBackup = null;
  try {
    // Copy only a closed, already validated backup into the target's filesystem.
    const stagedFd = openSync(staged, "wx");
    closeSync(stagedFd);
    const data = await import("node:fs/promises");
    await data.copyFile(backup, staged);
    verify(staged);

    if (targetExists) {
      const existing = new Database(target, { timeout: 5000 });
      try {
        const checkpoint = existing.pragma("wal_checkpoint(TRUNCATE)")[0];
        if (checkpoint?.busy) throw new Error("Could not checkpoint database WAL; stop all RoadFix server processes and retry");
      } finally {
        existing.close();
      }
      assertSafeSidecarState(target);
      const safety = await backupDatabase({
        sourcePath: target,
        directory: dirname(target),
        now: new Date(),
      });
      safetyBackup = safety.path;
    }

    if (targetExists) {
      moveNoReplace(target, displaced, move);
      movedOriginal = true;
      for (let i = 0; i < sidecars(target).length; i += 1) moveIfPresent(sidecars(target)[i], displacedSidecars[i], move);
    }
    promotionAttempted = true;
    move(staged, target);
    promoted = true;
    const restored = verify(target);
    // Commit point: verification succeeded. Cleanup is best-effort from here on.
    const cleanupFailures = [];
    if (movedOriginal) {
      for (const path of [displaced, ...displacedSidecars]) {
        if (!existsSync(path)) continue;
        try { remove(path, { force: true }); } catch { cleanupFailures.push(path); }
      }
    }
    return { path: target, verification: restored, safetyBackup, recoveryFiles: cleanupFailures };
  } catch (error) {
    const recoveryFiles = [];
    const rollbackErrors = [];
    const candidatePaths = [];
    let rollbackCanContinue = true;
    const candidateMayBeAtTarget = promoted || promotionAttempted;
    if (candidateMayBeAtTarget) {
      for (const from of [...sidecars(target), target]) {
        if (!existsSync(from)) continue;
        const suffix = from === target ? ".sqlite" : from.slice(target.length);
        const quarantine = uniqueRecoveryPath(target, id, "failed-candidate", suffix);
        candidatePaths.push(from, quarantine);
        try { moveNoReplace(from, quarantine, move); recoveryFiles.push(quarantine); }
        catch (rollbackError) {
          rollbackErrors.push(`quarantine candidate ${from} to ${quarantine}: ${rollbackError.message}`);
          recoveryFiles.push(from, quarantine);
          rollbackCanContinue = false;
        }
      }
    }
    if (movedOriginal && rollbackCanContinue) {
      // Put original sidecars back before its database. If any sidecar is blocked,
      // leave the database displaced rather than pairing it with candidate state.
      for (let i = 0; i < displacedSidecars.length; i += 1) {
        const from = displacedSidecars[i]; const to = sidecars(target)[i];
        if (!existsSync(from)) continue;
        if (existsSync(to)) {
          rollbackErrors.push(`cannot restore original sidecar ${from}; destination exists: ${to}`);
          recoveryFiles.push(from, to);
          rollbackCanContinue = false;
          break;
        }
        try { moveNoReplace(from, to, move); }
        catch (rollbackError) {
          rollbackErrors.push(`restore original sidecar ${from} to ${to}: ${rollbackError.message}`);
          recoveryFiles.push(from, to);
          rollbackCanContinue = false;
          break;
        }
      }
      if (rollbackCanContinue && existsSync(displaced)) {
        if (existsSync(target)) {
          rollbackErrors.push(`cannot restore original database ${displaced}; destination exists: ${target}`);
          recoveryFiles.push(displaced, target);
        } else {
          try { moveNoReplace(displaced, target, move); }
          catch (rollbackError) { rollbackErrors.push(`restore original database ${displaced} to ${target}: ${rollbackError.message}`); recoveryFiles.push(displaced, target); }
        }
      }
    } else if (movedOriginal && !candidateMayBeAtTarget) {
      // On pre-promotion failure, sidecars still at target belong to the original.
      for (let i = 0; i < displacedSidecars.length; i += 1) {
        const from = displacedSidecars[i]; const to = sidecars(target)[i];
        if (!existsSync(from) || existsSync(to)) continue;
        try { moveNoReplace(from, to, move); }
        catch (rollbackError) {
          rollbackErrors.push(`restore original sidecar ${from} to ${to}: ${rollbackError.message}`);
          recoveryFiles.push(from, to);
          rollbackCanContinue = false;
          break;
        }
      }
      if (rollbackCanContinue && existsSync(displaced)) {
        if (existsSync(target)) recoveryFiles.push(displaced, target);
        else {
          try { moveNoReplace(displaced, target, move); }
          catch (rollbackError) { rollbackErrors.push(`restore original database ${displaced} to ${target}: ${rollbackError.message}`); recoveryFiles.push(displaced, target); }
        }
      }
    } else if (candidateMayBeAtTarget && !movedOriginal) {
      recoveryFiles.push(target);
    }
    for (const path of [staged, ...stagedSidecars]) if (existsSync(path)) recoveryFiles.push(path);
    const uniqueRecovery = [...new Set(recoveryFiles)];
    const inventory = [...new Set([backup, target, ...sidecars(target), displaced, ...displacedSidecars, staged, ...stagedSidecars, ...candidatePaths, ...recoveryFiles])];
    const details = [error.message, ...rollbackErrors, `restore recovery paths: ${inventory.join(", ")}`, ...(uniqueRecovery.length ? [`existing recovery files: ${uniqueRecovery.join(", ")}`] : []), ...(safetyBackup ? [`original safety backup: ${safetyBackup}`] : []), ...(rollbackErrors.length ? ["Manual recovery: stop RoadFix and all SQLite clients; do not open or delete these files. Preserve every listed file. Move any failed candidate database, WAL, and SHM still at target paths to new, non-existing quarantine paths on the same volume; never overwrite a recovery path. Confirm no candidate sidecar remains at target, restore displaced original sidecars to their matching target names, then restore the displaced original database last. Verify integrity before restarting."] : [])];
    throw new Error(details.join("; "), { cause: error });
  }
}

export function integrityCheck(path = DEFAULT_DATABASE_PATH) {
  return verifyDatabase(path);
}
