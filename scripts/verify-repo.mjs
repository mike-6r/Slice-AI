import { execFileSync } from "node:child_process";
import net from "node:net";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const npmCli = process.env.npm_execpath;
let failures = 0;

function run(label, cwd, args) {
  console.log(`\n== ${label} ==`);
  try {
    const command = npmCli ? process.execPath : "npm";
    const commandArgs = npmCli ? [npmCli, ...args] : args;
    execFileSync(command, commandArgs, {
      cwd,
      stdio: "inherit",
    });
    console.log(`PASS ${label}`);
  } catch {
    failures += 1;
    console.error(`FAIL ${label}`);
  }
}

function portAvailable(url) {
  try {
    const parsed = new URL(url);
    return new Promise((resolvePort) => {
      const socket = net.createConnection({
        host: parsed.hostname,
        port: Number(parsed.port || 5432),
      });
      socket.setTimeout(1_000);
      socket.once("connect", () => {
        socket.destroy();
        resolvePort(true);
      });
      socket.once("timeout", () => {
        socket.destroy();
        resolvePort(false);
      });
      socket.once("error", () => resolvePort(false));
    });
  } catch {
    return Promise.resolve(false);
  }
}

run("frontend typecheck", root, ["run", "typecheck"]);
run("frontend tests", root, ["test"]);
run("frontend build", root, ["run", "build"]);
run("changed-file lint", root, ["run", "lint:changed"]);
run("frontend lint", root, ["run", "lint"]);

const server = resolve(root, "server");
run("backend Prisma generate", server, ["run", "prisma:generate"]);
run("backend Prisma validate", server, ["run", "prisma:validate"]);
run("backend typecheck", server, ["run", "typecheck"]);
run("backend lint", server, ["run", "lint"]);
run("backend tests", server, ["test"]);
run("backend build", server, ["run", "build"]);

const discord = resolve(root, "apps/discord-bot");
run("Discord typecheck", discord, ["run", "typecheck"]);
run("Discord lint", discord, ["run", "lint"]);
run("Discord unit tests", discord, ["run", "test:unit"]);
run("Discord build", discord, ["run", "build"]);

const integrationUrl = process.env.TEST_DATABASE_URL;
if (!integrationUrl) {
  console.log(
    "SKIPPED — PREREQUISITE MISSING Discord integration tests require TEST_DATABASE_URL for an isolated slice_test PostgreSQL database.",
  );
} else if (await portAvailable(integrationUrl)) {
  run("Discord integration tests", discord, ["run", "test:integration"]);
} else {
  console.log(
    "SKIPPED — PREREQUISITE MISSING TEST_DATABASE_URL is configured but PostgreSQL is unreachable.",
  );
}

if (failures) process.exit(1);
console.log(
  "\nPASS repository verification gate (with any prerequisite skips and known baseline debt reported above).",
);
