#!/usr/bin/env node
// CI dependency-audit gate (security.md §3.2).
//
// `npm audit --omit=dev --json` reports every advisory in the PRODUCTION tree.
// We fail the build on any HIGH or CRITICAL advisory EXCEPT those whose GHSA id is
// explicitly allowlisted below with a written justification. This preserves the
// strict high/critical gate while permitting advisories that provably cannot affect
// Calldone's deployed artifact. npm has no native per-advisory ignore, hence this
// post-processor instead of a bare `npm audit --audit-level=high`.
//
// Adding to the allowlist is a deliberate, reviewable act: every entry needs a reason,
// and entries should be removed the moment a non-breaking upstream fix exists.
//
// Usage: node check-audit.mjs <path-to-audit-json>

import { readFileSync } from "node:fs";

// GHSA ids accepted as non-applicable to Calldone's production build.
const ALLOWLIST = new Map([
  [
    "GHSA-gv7w-rqvm-qjhr",
    "esbuild: missing binary-integrity verification when installed AS A DENO MODULE via a " +
      "malicious NPM_CONFIG_REGISTRY. Not our install path — we install via `npm ci` against " +
      "the default registry with package-lock.json integrity hashes, never as a Deno module. " +
      "Only non-breaking fix is vite@8 (major bump); revisit when vite-react-ssg supports it.",
  ],
  [
    "GHSA-67mh-4wv8-2f99",
    "esbuild dev server lets any site read responses — dev-only; our prod output is a static " +
      "SSG bundle with no dev server. (Currently moderate, so below the gate; listed for clarity.)",
  ],
]);

const path = process.argv[2] ?? "audit.json";
let report;
try {
  report = JSON.parse(readFileSync(path, "utf8"));
} catch (err) {
  console.error(`::error::Could not read/parse npm audit JSON at "${path}": ${err.message}`);
  process.exit(1);
}

// Collect distinct ROOT advisories (objects carrying a GHSA url) at high/critical.
// String entries in `.via` are transitive rollups — the real advisory always appears
// as an object on its source package, so nothing is missed by skipping the strings.
const advisories = new Map(); // ghsa -> { severity, title, module }
for (const vuln of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    if (typeof via !== "object" || !via.url) continue;
    if (via.severity !== "high" && via.severity !== "critical") continue;
    const ghsa = (via.url.match(/GHSA-[0-9a-z-]+/i) ?? [])[0];
    if (ghsa) advisories.set(ghsa, { severity: via.severity, title: via.title, module: via.name });
  }
}

const allowed = [...advisories.entries()].filter(([ghsa]) => ALLOWLIST.has(ghsa));
const blocking = [...advisories.entries()].filter(([ghsa]) => !ALLOWLIST.has(ghsa));

if (allowed.length) {
  console.log("Allowlisted high/critical advisories (not blocking):");
  for (const [ghsa, a] of allowed) console.log(`  • ${ghsa} [${a.severity}] ${a.module}: ${a.title}`);
}

if (blocking.length) {
  console.error("::error::High/critical advisories without a documented allowlist entry:");
  for (const [ghsa, a] of blocking) console.error(`  ✗ ${ghsa} [${a.severity}] ${a.module}: ${a.title}`);
  console.error(
    `\n${blocking.length} blocking advisory(ies). Update the dependency, or add a justified ` +
      `entry to the ALLOWLIST in .github/scripts/check-audit.mjs.`,
  );
  process.exit(1);
}

console.log(
  `\nDependency audit passed: 0 un-allowlisted high/critical advisories (${allowed.length} allowlisted).`,
);
