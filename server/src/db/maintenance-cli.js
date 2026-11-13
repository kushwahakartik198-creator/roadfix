import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { backupDatabase, backupSet, integrityCheck, restoreDatabase } from "./maintenance.js";
import { DEFAULT_DATABASE_PATH } from "./database.js";

function option(args, name, fallback) {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
}

export async function runMaintenanceCli({
  argv = process.argv.slice(2),
  restore = restoreDatabase,
  createBackupSet = backupSet,
  log = console.log,
  reportError = console.error,
} = {}) {
  const [command, ...args] = argv;
  try {
  let result;
  if (command === "backup") {
    result = await backupDatabase({
      sourcePath: resolve(option(args, "--database", DEFAULT_DATABASE_PATH)),
      directory: resolve(option(args, "--directory", resolve(dirname(DEFAULT_DATABASE_PATH), "backups"))),
    });
  } else if (command === "restore") {
    const backupPath = args.find((arg) => !arg.startsWith("--"));
    result = await restore({
      backupPath,
      targetPath: resolve(option(args, "--database", DEFAULT_DATABASE_PATH)),
      confirmOverwrite: args.includes("--confirm-overwrite"),
    });
  } else if (command === "backup-set") {
    result = await createBackupSet({
      sourcePath: option(args, "--database"),
      uploadsPath: option(args, "--uploads"),
      directory: option(args, "--directory"),
      confirmServerStopped: args.includes("--confirm-server-stopped"),
    });
  } else if (command === "integrity") {
    const path = args.find((arg) => !arg.startsWith("--")) ?? DEFAULT_DATABASE_PATH;
    result = integrityCheck(resolve(path));
  } else {
    throw new Error("Usage: node src/db/maintenance-cli.js <backup|backup-set|restore|integrity> [arguments]");
  }
    if (command === "backup-set") {
      log("backup set created and verified");
      log("Operator attested that RoadFix and all SQLite writers were stopped; this is not automatic process detection.");
      log(`Backup set: ${result.path}`);
      log(`Database: ${result.databasePath}`);
      log(`Integrity: ${result.databaseVerification.integrity}`);
      log(`Manifest: ${result.manifestPath}`);
      log(`Upload files: ${result.verification.fileCount}`);
      log(`Upload bytes: ${result.verification.totalBytes}`);
    } else if (command === "restore") {
      const recoveryFiles = Array.isArray(result.recoveryFiles) ? result.recoveryFiles : [];
      log(recoveryFiles.length ? "restore successful with leftover recovery files" : "restore successful");
      log(`Database: ${result.path}`);
      if (result.safetyBackup) log(`Safety backup: ${result.safetyBackup}`);
      log(`Integrity: ${result.verification?.integrity ?? result.integrity}`);
      if (recoveryFiles.length) {
        log("Cleanup incomplete: recovery files remain. Do not delete these files until each has been checked.");
        for (const path of recoveryFiles) log(`Recovery file: ${path}`);
      }
    } else {
      log(`${command} successful`);
      log(`Database: ${result.path}`);
      if (result.safetyBackup) log(`Safety backup: ${result.safetyBackup}`);
      log(`Integrity: ${result.verification?.integrity ?? result.integrity}`);
    }
    return 0;
  } catch (error) {
    reportError(`${command ?? "database maintenance"} failed: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runMaintenanceCli();
}
