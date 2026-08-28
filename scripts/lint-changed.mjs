import { execFileSync } from "node:child_process";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
// Every push is checked independently. Depending on GitHub's event `before`
// SHA made this quality gate flaky after force-pushes and history rewrites;
// the repository is fetched with parent history, so HEAD~1 is deterministic.
const base = "HEAD~1";

function changedFiles() {
  const list = (range) =>
    execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMR", range], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
      .split(/\r?\n/)
      .filter(Boolean);
  try {
    const range = `${base}..HEAD`;
    return list(range);
  } catch {
    console.warn("Changed-file lint parent is unavailable; checking the checked-out commit.");
    return list("HEAD");
  }
}

function run(label, command, args, cwd) {
  console.log(`\n== ${label} ==`);
  try {
    execFileSync(command, args, {
      cwd,
      stdio: "inherit",
    });
    console.log(`PASS ${label}`);
  } catch {
    console.error(`FAIL ${label}`);
    process.exitCode = 1;
  }
}

function runEslint(label, cwd, filesToLint) {
  run(
    label,
    process.execPath,
    [
      resolve(cwd, "node_modules", "eslint", "bin", "eslint.js"),
      "--no-warn-ignored",
      ...filesToLint,
    ],
    cwd,
  );
}

const files = changedFiles();
const frontend = files.filter((file) => /^(src|scripts)\/.*\.(?:[cm]?[jt]sx?|[cm]?js)$/.test(file));
const backend = files
  .filter((file) => /^server\/(?:src|test)\/.*\.ts$/.test(file))
  .map((file) => relative(resolve(root, "server"), resolve(root, file)));
const discord = files
  .filter((file) => /^apps\/discord-bot\/(?:src|test)\/.*\.ts$/.test(file))
  .map((file) => relative(resolve(root, "apps/discord-bot"), resolve(root, file)));

if (!frontend.length && !backend.length && !discord.length) {
  console.log("PASS changed-file lint: no lintable changed source files.");
} else {
  if (frontend.length) runEslint("changed frontend lint", root, frontend);
  if (backend.length) runEslint("changed backend lint", resolve(root, "server"), backend);
  if (discord.length) runEslint("changed Discord lint", resolve(root, "apps/discord-bot"), discord);
}

if (process.exitCode) process.exit(process.exitCode);
