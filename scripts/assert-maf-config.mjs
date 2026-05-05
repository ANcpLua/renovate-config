// Validates that default.json's Microsoft Agent Framework rules match
// data/microsoft-agent-framework-packages.json (the authoritative 2026-05-05 matrix).
// Run with: node scripts/assert-maf-config.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const config = JSON.parse(readFileSync(resolve(repoRoot, "default.json"), "utf8"));
const matrix = JSON.parse(readFileSync(resolve(repoRoot, "data/microsoft-agent-framework-packages.json"), "utf8"));

const failures = [];
const assert = (cond, msg) => { if (!cond) failures.push(msg); };

const STATUS_ORDER = ["stable", "rc", "preview", "alpha"];
const STATUSES = new Set(STATUS_ORDER);

const stableRegexLiteral = "/^\\d+\\.\\d+\\.\\d+$/";
const rcRegexLiteral = "/^\\d+\\.\\d+\\.\\d+(?:-rc(?:\\.?\\d+(?:\\.\\d+)*)?)?$/i";

function compileAllowedVersionsRegex(literal) {
  // Renovate allowedVersions slash-form: /pattern/flags
  const match = /^\/(.+)\/([a-z]*)$/.exec(literal);
  if (!match) throw new Error(`Bad allowedVersions literal: ${literal}`);
  return new RegExp(match[1], match[2]);
}

function findRule(predicate, label) {
  const idx = config.packageRules.findIndex(predicate);
  if (idx === -1) {
    failures.push(`Missing rule: ${label}`);
    return { rule: null, idx: -1 };
  }
  return { rule: config.packageRules[idx], idx };
}

// ---- summary counts ----
const expectedSummary = { stable: 6, rc: 6, preview: 18, alpha: 1, total: 31 };
for (const key of Object.keys(expectedSummary)) {
  assert(matrix.summary[key] === expectedSummary[key],
    `summary.${key} expected ${expectedSummary[key]}, got ${matrix.summary[key]}`);
}

// ---- packages array integrity ----
assert(Array.isArray(matrix.packages), "matrix.packages must be an array");
assert(matrix.packages.length === expectedSummary.total,
  `matrix.packages.length expected ${expectedSummary.total}, got ${matrix.packages.length}`);

const seenNames = new Set();
const byStatus = { stable: [], rc: [], preview: [], alpha: [] };
for (const pkg of matrix.packages) {
  assert(STATUSES.has(pkg.status), `unknown status for ${pkg.name}: ${pkg.status}`);
  assert(!seenNames.has(pkg.name), `duplicate package name: ${pkg.name}`);
  seenNames.add(pkg.name);
  if (byStatus[pkg.status]) byStatus[pkg.status].push(pkg.name);
  if (pkg.status === "stable" || pkg.status === "rc") {
    assert(pkg.description && pkg.description.length > 0,
      `${pkg.status} package missing description: ${pkg.name}`);
  }
}

for (const status of STATUS_ORDER) {
  assert(byStatus[status].length === expectedSummary[status],
    `bucket ${status} count expected ${expectedSummary[status]}, got ${byStatus[status].length}`);
}

// ---- supersededBy correctness ----
const expectedSuperseded = {
  "Microsoft.Agents.AI.AzureAI": "Microsoft.Agents.AI.Foundry",
  "Microsoft.Agents.AI.Workflows.Declarative.AzureAI": "Microsoft.Agents.AI.Workflows.Declarative.Foundry",
  "Microsoft.Agents.AI.FoundryMemory": "Microsoft.Agents.AI.Foundry"
};
const supersededInMatrix = Object.fromEntries(
  matrix.packages.filter(p => p.supersededBy).map(p => [p.name, p.supersededBy])
);
for (const [name, target] of Object.entries(expectedSuperseded)) {
  assert(supersededInMatrix[name] === target,
    `${name} supersededBy expected ${target}, got ${supersededInMatrix[name]}`);
}
for (const [name] of Object.entries(supersededInMatrix)) {
  assert(name in expectedSuperseded, `unexpected supersededBy entry: ${name}`);
}

// ---- packages sorted by status (stable, rc, preview, alpha) then name ----
const sortedExpected = [...matrix.packages].sort((a, b) => {
  const sa = STATUS_ORDER.indexOf(a.status);
  const sb = STATUS_ORDER.indexOf(b.status);
  if (sa !== sb) return sa - sb;
  return a.name.localeCompare(b.name);
});
for (let i = 0; i < matrix.packages.length; i++) {
  assert(matrix.packages[i].name === sortedExpected[i].name,
    `packages not sorted: at index ${i} expected ${sortedExpected[i].name}, got ${matrix.packages[i].name}`);
}

// ---- expected MAF rule contents ----
const stableNonSuperseded = byStatus.stable.slice().sort();
const rcActive = matrix.packages
  .filter(p => p.status === "rc" && !p.supersededBy).map(p => p.name).sort();
const previewNonSuperseded = matrix.packages
  .filter(p => p.status === "preview" && !p.supersededBy).map(p => p.name);
const alphaNames = byStatus.alpha.slice();
const quarantineExpected = [...previewNonSuperseded, ...alphaNames].sort();

assert(stableNonSuperseded.length === 6, `stable bucket length expected 6, got ${stableNonSuperseded.length}`);
assert(rcActive.length === 4, `rc-active expected 4, got ${rcActive.length}`);
assert(quarantineExpected.length === 18, `quarantine expected 18, got ${quarantineExpected.length}`);

// ---- locate rules ----
const isMafStable = r => r.groupName === "microsoft-agent-framework-stable";
const isMafRc = r => r.groupName === "microsoft-agent-framework-rc";
const isMafQuarantine = r => r.groupName === "microsoft-agent-framework-preview-alpha-quarantine";
const isGlobalMajor = r => Array.isArray(r.matchUpdateTypes) && r.matchUpdateTypes.includes("major")
  && !r.groupName && r.automerge === false;

const stable = findRule(isMafStable, "MAF stable allowlist");
const rc = findRule(isMafRc, "MAF RC allowlist");
const quarantine = findRule(isMafQuarantine, "MAF preview/alpha quarantine");
const major = findRule(isGlobalMajor, "global major manual-review");

const eqSet = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

if (stable.rule) {
  const got = [...stable.rule.matchPackageNames].sort();
  assert(eqSet(got, stableNonSuperseded),
    `MAF stable matchPackageNames mismatch.\n  expected: ${stableNonSuperseded.join(",")}\n  got:      ${got.join(",")}`);
  assert(stable.rule.allowedVersions === stableRegexLiteral,
    `MAF stable allowedVersions expected ${stableRegexLiteral}, got ${stable.rule.allowedVersions}`);
  assert(stable.rule.automerge === true, "MAF stable should automerge");
  assert(!("matchUpdateTypes" in stable.rule),
    "MAF stable rule must not combine allowedVersions with matchUpdateTypes");
}

if (rc.rule) {
  const got = [...rc.rule.matchPackageNames].sort();
  assert(eqSet(got, rcActive),
    `MAF RC matchPackageNames mismatch.\n  expected: ${rcActive.join(",")}\n  got:      ${got.join(",")}`);
  assert(rc.rule.ignoreUnstable === false, "MAF RC rule must set ignoreUnstable: false");
  assert(rc.rule.respectLatest === false, "MAF RC rule must set respectLatest: false");
  assert(rc.rule.allowedVersions === rcRegexLiteral,
    `MAF RC allowedVersions expected ${rcRegexLiteral}, got ${rc.rule.allowedVersions}`);
  assert(rc.rule.automerge === true, "MAF RC should automerge");
  assert(!("matchUpdateTypes" in rc.rule),
    "MAF RC rule must not combine allowedVersions with matchUpdateTypes");
}

if (quarantine.rule) {
  const got = [...quarantine.rule.matchPackageNames].sort();
  assert(eqSet(got, quarantineExpected),
    `MAF quarantine matchPackageNames mismatch.\n  expected: ${quarantineExpected.join(",")}\n  got:      ${got.join(",")}`);
  assert(quarantine.rule.automerge === false, "MAF quarantine rule must not automerge");
  assert(quarantine.rule.dependencyDashboardApproval === true,
    "MAF quarantine rule must require dashboard approval");
  assert(!("matchUpdateTypes" in quarantine.rule),
    "MAF quarantine rule must not combine allowedVersions with matchUpdateTypes");
}

// ---- replacement rules ----
const replacementRules = config.packageRules.filter(r =>
  typeof r.replacementName === "string" && Array.isArray(r.matchPackageNames));
const replacementByFrom = {};
for (const r of replacementRules) {
  if (r.matchPackageNames.length !== 1) {
    failures.push(`replacement rule should target exactly one package: ${JSON.stringify(r.matchPackageNames)}`);
    continue;
  }
  replacementByFrom[r.matchPackageNames[0]] = r;
}
const expectedReplacements = {
  "Microsoft.Agents.AI.AzureAI": { name: "Microsoft.Agents.AI.Foundry", version: "1.3.0" },
  "Microsoft.Agents.AI.Workflows.Declarative.AzureAI": { name: "Microsoft.Agents.AI.Workflows.Declarative.Foundry", version: "1.3.0-rc1" },
  "Microsoft.Agents.AI.FoundryMemory": { name: "Microsoft.Agents.AI.Foundry", version: "1.3.0" }
};
for (const [from, target] of Object.entries(expectedReplacements)) {
  const r = replacementByFrom[from];
  if (!r) { failures.push(`missing replacement rule for ${from}`); continue; }
  assert(r.replacementName === target.name,
    `replacement ${from} → expected ${target.name}, got ${r.replacementName}`);
  assert(r.replacementVersion === target.version,
    `replacement ${from} version expected ${target.version}, got ${r.replacementVersion}`);
  assert(r.automerge === false, `replacement ${from} must not automerge`);
  assert(r.dependencyDashboardApproval === true,
    `replacement ${from} must require dashboard approval`);
}

// ---- no allowedVersions + matchUpdateTypes combo anywhere ----
config.packageRules.forEach((r, i) => {
  if (r.allowedVersions && r.matchUpdateTypes) {
    failures.push(`packageRules[${i}] combines allowedVersions and matchUpdateTypes — forbidden`);
  }
});

// ---- no broad ^Microsoft\.Agents\.AI automerge rule ----
config.packageRules.forEach((r, i) => {
  const names = r.matchPackageNames || [];
  const hasBroad = names.some(n => /^\/\^Microsoft\\\.Agents\\\.AI/i.test(n));
  if (hasBroad && r.automerge === true) {
    failures.push(`packageRules[${i}] is a broad Microsoft.Agents.AI rule with automerge: true — forbidden`);
  }
});

// ---- ordering: stable + RC must come AFTER global major rule ----
if (major.idx !== -1) {
  if (stable.idx !== -1) {
    assert(stable.idx > major.idx,
      `MAF stable rule (idx ${stable.idx}) must come AFTER global major rule (idx ${major.idx})`);
  }
  if (rc.idx !== -1) {
    assert(rc.idx > major.idx,
      `MAF RC rule (idx ${rc.idx}) must come AFTER global major rule (idx ${major.idx})`);
  }
}

// ---- allowedVersions regex behavior ----
const stableRe = compileAllowedVersionsRegex(stableRegexLiteral);
const rcRe = compileAllowedVersionsRegex(rcRegexLiteral);

const stableShouldAccept = ["1.3.0"];
const stableShouldReject = ["1.3.0-rc1", "1.3.0-preview.260423.1", "1.3.0-alpha.260423.1", "1.3.0-beta.1"];
for (const v of stableShouldAccept) {
  assert(stableRe.test(v), `stable regex should accept ${v}`);
}
for (const v of stableShouldReject) {
  assert(!stableRe.test(v), `stable regex should reject ${v}`);
}

const rcShouldAccept = ["1.3.0", "1.3.0-rc1", "1.3.0-rc.1"];
const rcShouldReject = ["1.3.0-preview.260423.1", "1.3.0-alpha.260423.1", "1.3.0-beta.1", "1.3.0-dev.1", "1.3.0-nightly.1"];
for (const v of rcShouldAccept) {
  assert(rcRe.test(v), `rc regex should accept ${v}`);
}
for (const v of rcShouldReject) {
  assert(!rcRe.test(v), `rc regex should reject ${v}`);
}

// ---- summary ----
if (failures.length > 0) {
  console.error("MAF config assertion failures:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`MAF config OK — ${matrix.packages.length} packages, ${replacementRules.length} replacement rules, regex behavior verified.`);
