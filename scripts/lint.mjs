#!/usr/bin/env node
// Lightweight lint with no dependencies: syntax-check every JS file, parse every JSON file,
// and refuse obvious secrets or real-looking account ids in tracked sources.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const root = new URL("..", import.meta.url).pathname;
const skip = new Set(["node_modules", ".git", ".wrangler"]);
const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    if (skip.has(n) || n === "r2-inbox.config.json" || n.startsWith(".wrangler.generated")) continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p); else files.push(p);
  }
})(root);

let bad = 0;
const fail = (f, m) => { bad++; console.error(`${relative(root, f)}: ${m}`); };
const SECRET = [
  [/\b(?!0123456789abcdef0123456789abcdef\b)[0-9a-f]{32}\b/, "32-hex value (account/zone id?) - use $CLOUDFLARE_ACCOUNT_ID"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, "AWS-style access key"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, "GitHub token"],
  [/\bxox[abpr]-[A-Za-z0-9-]{10,}/, "Slack token"],
];
for (const f of files) {
  const text = readFileSync(f, "utf8");
  if (/\.(m?js)$/.test(f)) {
    const r = spawnSync(process.execPath, ["--check", f], { encoding: "utf8" });
    if (r.status !== 0) fail(f, r.stderr.split("\n").slice(0, 4).join(" "));
  }
  if (/\.json$/.test(f)) { try { JSON.parse(text); } catch (e) { fail(f, "invalid JSON: " + e.message); } }
  if (/package-lock\.json$|\.eml$/.test(f)) continue;
  for (const [re, what] of SECRET) if (re.test(text) && !/lint\.mjs$/.test(f)) fail(f, `possible secret: ${what}`);
  if (/[ \t]+$/m.test(text) && !/\.(md|eml)$/.test(f) && !/page\.js$/.test(f)) fail(f, "trailing whitespace");
}
console.log(bad ? `lint: ${bad} problem(s) in ${files.length} files` : `lint: ok (${files.length} files)`);
process.exit(bad ? 1 : 0);
