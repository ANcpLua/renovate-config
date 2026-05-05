// Validates that default.json's Microsoft Agent Framework rules match
// data/microsoft-agent-framework-packages.json (the authoritative local matrix).
// Run with: node scripts/assert-maf-config.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const config = JSON.parse(readFileSync(resolve(repoRoot, "default.json"), "utf8"));
const matrix = JSON.parse(readFileSync(resolve(repoRoot, "data/microsoft-agent-framework-packages.json"), "utf8"));

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const EXPECTED_AS_OF = "2026-05-05";
const EXPECTED_SUMMARY = { stable: 6, rc: 6, preview: 18, alpha: 1, total: 31 };
const STATUS_ORDER = ["stable", "rc", "preview", "alpha"];
const STATUSES = new Set(STATUS_ORDER);

const EXPECTED_STABLE = [
  "Microsoft.Agents.AI",
  "Microsoft.Agents.AI.Abstractions",
  "Microsoft.Agents.AI.Foundry",
  "Microsoft.Agents.AI.OpenAI",
  "Microsoft.Agents.AI.Workflows",
  "Microsoft.Agents.AI.Workflows.Generators"
].sort();

const EXPECTED_ACTIVE_RC = [
  "Microsoft.Agents.AI.Declarative",
  "Microsoft.Agents.AI.Purview",
  "Microsoft.Agents.AI.Workflows.Declarative",
  "Microsoft.Agents.AI.Workflows.Declarative.Foundry"
].sort();

const EXPECTED_SUPERSEDED = {
  "Microsoft.Agents.AI.AzureAI": "Microsoft.Agents.AI.Foundry",
  "Microsoft.Agents.AI.Workflows.Declarative.AzureAI": "Microsoft.Agents.AI.Workflows.Declarative.Foundry",
  "Microsoft.Agents.AI.FoundryMemory": "Microsoft.Agents.AI.Foundry"
};

const EXPECTED_SOURCE_OBSERVED = [
  "Microsoft.Agents.AI.Hyperlight",
  "Microsoft.Agents.AI.Hosting.AzureAIResponses",
  "Microsoft.Agents.AI.Mem0",
  "Microsoft.Agents.AI.Workflows.Declarative.Mcp"
].sort();

const STABLE_ALLOWED = "/^\\d+\\.\\d+\\.\\d+$/";
const RC_ALLOWED = "/^\\d+\\.\\d+\\.\\d+(?:-[Rr][Cc]\\d+)?$/";

function compileAllowedVersionsRegex(literal) {
  const match = /^\/(.*)\/([a-z]*)$/i.exec(literal);
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

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function sameSet(actual, expected) {
  const a = sorted(actual);
  const e = sorted(expected);
  return a.length === e.length && a.every((value, index) => value === e[index]);
}

function packageNamesFor(rule) {
  return Array.isArray(rule?.matchPackageNames) ? rule.matchPackageNames : [];
}

function assertExactNames(rule, expected, label) {
  const actual = packageNamesFor(rule);
  assert(
    sameSet(actual, expected),
    `${label} matchPackageNames mismatch.\n  expected: ${sorted(expected).join(", ")}\n  got:      ${sorted(actual).join(", ")}`
  );
  for (const name of actual) {
    assert(!name.startsWith("/"), `${label} must use exact package names, got regex ${name}`);
  }
}

function assertNoMatchUpdateTypes(rule, label) {
  assert(!("matchUpdateTypes" in rule), `${label} must not combine allowedVersions with matchUpdateTypes`);
}

function assertAutomergePr(rule, label) {
  assert(rule.automerge === true, `${label} must set automerge: true`);
  assert(rule.automergeType === "pr", `${label} must set automergeType: "pr"`);
}

// ---- matrix integrity ----
assert(matrix.asOf === EXPECTED_AS_OF, `matrix.asOf expected ${EXPECTED_AS_OF}, got ${matrix.asOf}`);
assert(Array.isArray(matrix.packages), "matrix.packages must be an array");
assert(matrix.packages.length === EXPECTED_SUMMARY.total, `published package count expected ${EXPECTED_SUMMARY.total}, got ${matrix.packages.length}`);

const seenNames = new Set();
const packagesByName = new Map();
const byStatus = Object.fromEntries(STATUS_ORDER.map(status => [status, []]));
for (const pkg of matrix.packages ?? []) {
  assert(typeof pkg.name === "string" && pkg.name.length > 0, `package missing name: ${JSON.stringify(pkg)}`);
  assert(typeof pkg.version === "string" && pkg.version.length > 0, `${pkg.name} missing version`);
  assert(STATUSES.has(pkg.status), `unknown status for ${pkg.name}: ${pkg.status}`);
  assert(!seenNames.has(pkg.name), `duplicate package name: ${pkg.name}`);
  seenNames.add(pkg.name);
  packagesByName.set(pkg.name, pkg);
  byStatus[pkg.status]?.push(pkg);
}

for (const status of STATUS_ORDER) {
  assert(matrix.summary?.[status] === EXPECTED_SUMMARY[status], `summary.${status} expected ${EXPECTED_SUMMARY[status]}, got ${matrix.summary?.[status]}`);
  assert(byStatus[status].length === EXPECTED_SUMMARY[status], `actual ${status} count expected ${EXPECTED_SUMMARY[status]}, got ${byStatus[status].length}`);
}
assert(matrix.summary?.total === EXPECTED_SUMMARY.total, `summary.total expected ${EXPECTED_SUMMARY.total}, got ${matrix.summary?.total}`);

const sortedExpected = [...(matrix.packages ?? [])].sort((a, b) => {
  const statusDiff = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
  return statusDiff || a.name.localeCompare(b.name);
});
for (let i = 0; i < sortedExpected.length; i++) {
  assert(matrix.packages[i].name === sortedExpected[i].name, `packages not sorted at index ${i}: expected ${sortedExpected[i].name}, got ${matrix.packages[i].name}`);
}

// ---- track-specific matrix assertions ----
const stablePackages = byStatus.stable.map(pkg => pkg.name);
assert(sameSet(stablePackages, EXPECTED_STABLE), `stable packages must be exactly ${EXPECTED_STABLE.join(", ")}`);
for (const name of EXPECTED_STABLE) {
  const pkg = packagesByName.get(name);
  assert(pkg?.version === "1.4.0", `${name} expected version 1.4.0, got ${pkg?.version}`);
  assert(/^\d+\.\d+\.\d+$/.test(pkg?.version ?? ""), `${name} must have a stable semver version, got ${pkg?.version}`);
}

const rcPackages = byStatus.rc.map(pkg => pkg.name);
const activeRcPackages = byStatus.rc.filter(pkg => !pkg.supersededBy).map(pkg => pkg.name);
assert(activeRcPackages.length === 4, `active RC count expected 4, got ${activeRcPackages.length}`);
assert(sameSet(activeRcPackages, EXPECTED_ACTIVE_RC), `active RC packages must be exactly ${EXPECTED_ACTIVE_RC.join(", ")}`);
for (const name of EXPECTED_ACTIVE_RC) {
  const pkg = packagesByName.get(name);
  assert(pkg?.version === "1.4.0-rc1", `${name} expected version 1.4.0-rc1, got ${pkg?.version}`);
  assert(/^\d+\.\d+\.\d+-[Rr][Cc]\d+$/.test(pkg?.version ?? ""), `${name} must have an rc semver version, got ${pkg?.version}`);
}
assert(rcPackages.length === EXPECTED_SUMMARY.rc, `published RC count expected ${EXPECTED_SUMMARY.rc}, got ${rcPackages.length}`);

const supersededInMatrix = Object.fromEntries(
  [...packagesByName.values()].filter(pkg => pkg.supersededBy).map(pkg => [pkg.name, pkg.supersededBy])
);
for (const [name, target] of Object.entries(EXPECTED_SUPERSEDED)) {
  assert(supersededInMatrix[name] === target, `${name} supersededBy expected ${target}, got ${supersededInMatrix[name]}`);
}
for (const [name] of Object.entries(supersededInMatrix)) {
  assert(name in EXPECTED_SUPERSEDED, `unexpected superseded package: ${name}`);
}

const previewAlphaPackages = [...byStatus.preview, ...byStatus.alpha].map(pkg => pkg.name);
assert(previewAlphaPackages.length === EXPECTED_SUMMARY.preview + EXPECTED_SUMMARY.alpha, `preview/alpha quarantine count expected 19, got ${previewAlphaPackages.length}`);

const sourceObserved = matrix.sourceObservedPackages ?? [];
assert(Array.isArray(sourceObserved), "matrix.sourceObservedPackages must be an array");
assert(sameSet(sourceObserved.map(pkg => pkg.name), EXPECTED_SOURCE_OBSERVED), `source-observed packages must be exactly ${EXPECTED_SOURCE_OBSERVED.join(", ")}`);
for (const pkg of sourceObserved) {
  assert(pkg.activeNuGetOrgAllowlist === false, `${pkg.name} must set activeNuGetOrgAllowlist: false`);
  assert(!packagesByName.has(pkg.name), `${pkg.name} must not be counted in matrix.packages`);
}

// ---- Renovate rule assertions ----
assert(config.platformAutomerge === true, "platformAutomerge should remain true");
assert(config.prHourlyLimit === 2, `prHourlyLimit should remain 2, got ${config.prHourlyLimit}`);
assert(config.prConcurrentLimit === 5, `prConcurrentLimit should remain 5, got ${config.prConcurrentLimit}`);

const globalMajor = findRule(
  rule => Array.isArray(rule.matchUpdateTypes) && rule.matchUpdateTypes.includes("major") && rule.automerge === false && !rule.groupName,
  "global major manual-review"
);
const mafStable = findRule(rule => rule.groupName === "microsoft-agent-framework-stable", "MAF stable allowlist");
const mafRc = findRule(rule => rule.groupName === "microsoft-agent-framework-rc", "MAF active RC allowlist");
const mafQuarantine = findRule(rule => rule.groupName === "microsoft-agent-framework-preview-alpha-quarantine", "MAF preview/alpha quarantine");

if (mafStable.rule) {
  assertExactNames(mafStable.rule, EXPECTED_STABLE, "MAF stable");
  assert(JSON.stringify(mafStable.rule.matchDatasources) === JSON.stringify(["nuget"]), "MAF stable must match only the nuget datasource");
  assert(mafStable.rule.allowedVersions === STABLE_ALLOWED, `MAF stable allowedVersions expected ${STABLE_ALLOWED}, got ${mafStable.rule.allowedVersions}`);
  assertAutomergePr(mafStable.rule, "MAF stable");
  assert(mafStable.rule.dependencyDashboardApproval === false, "MAF stable must not require dashboard approval");
  assertNoMatchUpdateTypes(mafStable.rule, "MAF stable");
}

if (mafRc.rule) {
  assertExactNames(mafRc.rule, EXPECTED_ACTIVE_RC, "MAF active RC");
  assert(JSON.stringify(mafRc.rule.matchDatasources) === JSON.stringify(["nuget"]), "MAF active RC must match only the nuget datasource");
  assert(mafRc.rule.ignoreUnstable === false, "MAF active RC must set ignoreUnstable: false");
  assert(mafRc.rule.respectLatest === false, "MAF active RC must set respectLatest: false");
  assert(mafRc.rule.allowedVersions === RC_ALLOWED, `MAF active RC allowedVersions expected ${RC_ALLOWED}, got ${mafRc.rule.allowedVersions}`);
  assertAutomergePr(mafRc.rule, "MAF active RC");
  assert(mafRc.rule.dependencyDashboardApproval === false, "MAF active RC must not require dashboard approval");
  assertNoMatchUpdateTypes(mafRc.rule, "MAF active RC");
}

if (mafQuarantine.rule) {
  assertExactNames(mafQuarantine.rule, previewAlphaPackages, "MAF preview/alpha quarantine");
  assert(JSON.stringify(mafQuarantine.rule.matchDatasources) === JSON.stringify(["nuget"]), "MAF quarantine must match only the nuget datasource");
  assert(mafQuarantine.rule.ignoreUnstable === false, "MAF quarantine must set ignoreUnstable: false");
  assert(mafQuarantine.rule.respectLatest === false, "MAF quarantine must set respectLatest: false");
  assert(mafQuarantine.rule.allowedVersions === RC_ALLOWED, `MAF quarantine allowedVersions expected ${RC_ALLOWED}, got ${mafQuarantine.rule.allowedVersions}`);
  assert(mafQuarantine.rule.automerge === false, "MAF quarantine must not automerge");
  assert(mafQuarantine.rule.dependencyDashboardApproval === true, "MAF quarantine must require dependency dashboard approval");
  assertNoMatchUpdateTypes(mafQuarantine.rule, "MAF quarantine");
}

if (globalMajor.idx !== -1) {
  assert(mafStable.idx > globalMajor.idx, `MAF stable rule (idx ${mafStable.idx}) must come after global major rule (idx ${globalMajor.idx})`);
  assert(mafRc.idx > globalMajor.idx, `MAF active RC rule (idx ${mafRc.idx}) must come after global major rule (idx ${globalMajor.idx})`);
}

const replacementRules = config.packageRules.filter(rule => typeof rule.replacementName === "string");
const replacementBySource = new Map();
for (const rule of replacementRules) {
  const names = packageNamesFor(rule);
  assert(names.length === 1, `replacement rule should target exactly one package: ${JSON.stringify(names)}`);
  if (names.length === 1) replacementBySource.set(names[0], rule);
}

for (const [from, to] of Object.entries(EXPECTED_SUPERSEDED)) {
  const rule = replacementBySource.get(from);
  assert(!!rule, `missing replacement rule for ${from}`);
  if (!rule) continue;
  assert(rule.replacementName === to, `replacement ${from} expected ${to}, got ${rule.replacementName}`);
  assert(rule.automerge === false, `replacement ${from} must not automerge`);
  assert(rule.dependencyDashboardApproval === true, `replacement ${from} must require dependency dashboard approval`);
  assert(Array.isArray(rule.prBodyNotes) && rule.prBodyNotes.some(note => /customManagers|custom\.regex|regex-managed|Version\.props/i.test(note)), `replacement ${from} must document regex customManagers / Version.props rename limitation`);
}

// ---- global Renovate policy assertions ----
config.packageRules.forEach((rule, index) => {
  if (rule.allowedVersions && rule.matchUpdateTypes) {
    failures.push(`packageRules[${index}] combines allowedVersions and matchUpdateTypes`);
  }

  const hasBroadMafRegex = packageNamesFor(rule).some(name => /^\/\^Microsoft\\\.Agents\\\.AI(?:\\\.|\b)/.test(name));
  if (hasBroadMafRegex && rule.automerge === true) {
    failures.push(`packageRules[${index}] is a broad Microsoft.Agents.AI automerge regex`);
  }
});

const npmDeny = findRule(
  rule => Array.isArray(rule.matchManagers) && rule.matchManagers.includes("npm") && typeof rule.allowedVersions === "string" && rule.allowedVersions.startsWith("!/"),
  "default-deny unstable npm"
);
if (npmDeny.rule) {
  for (const token of ["alpha", "beta", "rc", "preview", "pre", "dev", "canary", "next", "nightly"]) {
    assert(new RegExp(token, "i").test(npmDeny.rule.allowedVersions), `npm default-deny must block ${token}`);
  }
}

const nugetDeny = findRule(
  rule => Array.isArray(rule.matchDatasources) && rule.matchDatasources.includes("nuget") && typeof rule.allowedVersions === "string" && rule.allowedVersions.startsWith("!/"),
  "default-deny unstable NuGet"
);
if (nugetDeny.rule) {
  for (const token of ["alpha", "beta", "preview", "pre", "dev", "experimental", "nightly"]) {
    assert(new RegExp(token, "i").test(nugetDeny.rule.allowedVersions), `NuGet default-deny must block ${token}`);
  }
  assert(!/\brc\b/i.test(nugetDeny.rule.allowedVersions), "NuGet default-deny must not globally block rc");
}

for (const observed of EXPECTED_SOURCE_OBSERVED) {
  const activeRules = [mafStable.rule, mafRc.rule, mafQuarantine.rule].filter(Boolean);
  for (const rule of activeRules) {
    assert(!packageNamesFor(rule).includes(observed), `${observed} must not appear in active MAF NuGet.org allowlist/quarantine rules`);
  }
}

// ---- allowedVersions regex behavior ----
const stableAllowed = compileAllowedVersionsRegex(STABLE_ALLOWED);
const rcAllowed = compileAllowedVersionsRegex(RC_ALLOWED);

for (const version of ["1.4.0", "2.0.0"]) {
  assert(stableAllowed.test(version), `stable regex should accept ${version}`);
  assert(rcAllowed.test(version), `RC/quarantine regex should accept stable ${version}`);
}
for (const version of ["1.4.0-rc1", "1.4.0-RC2"]) {
  assert(!stableAllowed.test(version), `stable regex should reject ${version}`);
  assert(rcAllowed.test(version), `RC/quarantine regex should accept ${version}`);
}
for (const version of ["1.4.0-rc.1", "1.4.0-preview.260505.1", "1.4.0-alpha.260505.1", "1.4.0-beta.1", "1.4.0-dev.1", "1.4.0-nightly.1"]) {
  assert(!stableAllowed.test(version), `stable regex should reject ${version}`);
  assert(!rcAllowed.test(version), `RC/quarantine regex should reject ${version}`);
}

if (failures.length > 0) {
  console.error("MAF config assertion failures:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

try {
  execFileSync(
    "npx",
    ["--yes", "renovate-config-validator", "--strict", "--no-global", "default.json"],
    { cwd: repoRoot, stdio: "pipe", encoding: "utf8" }
  );
} catch (error) {
  console.error("renovate-config-validator failed:");
  if (error.stdout) console.error(error.stdout.trim());
  if (error.stderr) console.error(error.stderr.trim());
  process.exit(error.status || 1);
}

console.log(`MAF config OK - ${matrix.packages.length} published packages, ${sourceObserved.length} observed non-allowlist packages, ${replacementRules.length} replacement rules.`);
