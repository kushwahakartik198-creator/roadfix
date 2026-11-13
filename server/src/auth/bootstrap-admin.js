import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { openDatabase } from "../db/database.js";
import { provisionInitialAdmin } from "./accounts.js";

export async function promptHiddenPassword({ input = stdin, output = stdout } = {}) {
  if (!input.isTTY || typeof input.setRawMode !== "function") throw new Error("Bootstrap requires an interactive terminal so the password is not echoed");
  output.write("Administrator password (12–128 characters): ");
  input.setRawMode(true);
  input.resume();
  input.setEncoding("utf8");
  return new Promise((resolvePassword, reject) => {
    let password = "";
    const restore = () => {
      input.off("data", onData);
      input.setRawMode(false);
      output.write("\n");
    };
    const onData = (key) => {
      if (key === "\u0003") { restore(); reject(new Error("Bootstrap cancelled")); return; }
      if (key === "\r" || key === "\n") { restore(); resolvePassword(password); return; }
      if (key === "\u007f" || key === "\b") { password = password.slice(0, -1); return; }
      if (key >= " " && key !== "\u007f") password += key;
    };
    input.on("data", onData);
  });
}

async function run() {
  if (process.argv.length !== 2) throw new Error("The bootstrap tool accepts no command-line account or password arguments");
  const prompt = createInterface({ input: stdin, output: stdout });
  let email;
  try { email = await prompt.question("Administrator email: "); }
  finally { prompt.close(); }
  const password = await promptHiddenPassword();
  const confirmation = await promptHiddenPassword({ output: stdout });
  if (password !== confirmation) throw new Error("Passwords do not match");

  const db = openDatabase();
  try {
    const admin = await provisionInitialAdmin(db, { email, password });
    console.log(`Initial administrator created for ${admin.email}.`);
  } finally { db.close(); }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try { await run(); }
  catch (error) {
    console.error(error instanceof Error ? error.message : "Administrator bootstrap failed");
    process.exitCode = 1;
  }
}
