// Asserts that default.json's Microsoft Agent Framework rules agree with
// data/microsoft-agent-framework-packages.json (the authoritative 2026-05-05
// dotnet-1.4.0 matrix). The matrix is the single source of truth; default.json
// must align with it.
//
// Run with: node scripts/assert-maf-config.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const config = JSON.parse(readFileSync(resolve(repoRoot, "default.json"), "utf8"));
const matrix = JSON.parse(readFileSync(resolve(repoRoot, "data/microsoft-agent-framework-packages.json"), "utf8"));
const readme = readFileSync(resolve(repoRoot, "README.md"), "utf8");

const failures = [];
const assert = (cond, msg) => { if (!cond) failures.push(msg); };

const STATUS_ORDER = ["stable", "rc", "preview", "alpha"];
const STATUSES = new Set(STATUS_ORDER);

// Spec-mandated regex literals (prompt rules 5, 6, 9)
const stableRegexLiteral = "/^\\d+\\.\\d+\\.\\d+$/";
const rcRegexLiteral = "/^\\d+\\.\\d+\\.\\d+(?:-[Rr][Cc]\\d+)?$/";

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

const eqArr = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// ---------- 1. Matrix shape ----------
assert(matrix.asOf === "2026-05-05", `matrix.asOf expected 2026-05-05, got ${matrix.asOf}`);
assert(matrix.releaseLine === "dotnet-1.4.0", `matrix.releaseLine expected dotnet-1.4.0, got ${matrix.releaseLine}`);
assert(matrix.activePolicy && Array.isArray(matrix.activePolicy.packages),
  "matrix.activePolicy.packages must be an array");
assert(matrix.legacyObserved && Array.isArray(matrix.legacyObserved.packages),
  "matrix.legacyObserved.packages must be an array");
assert(matrix.sourceObserved && Array.isArray(matrix.sourceObserved.packages),
  "matrix.sourceObserved.packages must be an array");

// ---------- 1+2+3. Summary counts ----------
const activePackages = matrix.activePolicy.packages;
const legacyObservedPackages = matrix.legacyObserved.packages;
const sourceObservedPackages = matrix.sourceObserved.packages;

const byStatus = { stable: [], rc: [], preview: [], alpha: [] };
const seenNames = new Set();
for (const pkg of activePackages) {
  assert(STATUSES.has(pkg.status), `unknown active status for ${pkg.name}: ${pkg.status}`);
  assert(!seenNames.has(pkg.name), `duplicate active package: ${pkg.name}`);
  seenNames.add(pkg.name);
  byStatus[pkg.status].push(pkg);
}

const rcLegacy = byStatus.rc.filter(p => p.lifecycle === "legacy");
const rcActive = byStatus.rc.filter(p => p.lifecycle !== "legacy");

// Assertion 1: matrix summary counts match actual package statuses.
assert(matrix.summary.stable === byStatus.stable.length,
  `summary.stable=${matrix.summary.stable} but bucket has ${byStatus.stable.length}`);
assert(matrix.summary.rc === byStatus.rc.length,
  `summary.rc=${matrix.summary.rc} but bucket has ${byStatus.rc.length}`);
assert(matrix.summary.activeRc === rcActive.length,
  `summary.activeRc=${matrix.summary.activeRc} but active-RC bucket has ${rcActive.length}`);
assert(matrix.summary.legacyRc === rcLegacy.length,
  `summary.legacyRc=${matrix.summary.legacyRc} but legacy-RC bucket has ${rcLegacy.length}`);
assert(matrix.summary.preview === byStatus.preview.length,
  `summary.preview=${matrix.summary.preview} but bucket has ${byStatus.preview.length}`);
assert(matrix.summary.alpha === byStatus.alpha.length,
  `summary.alpha=${matrix.summary.alpha} but bucket has ${byStatus.alpha.length}`);
assert(matrix.summary.activePolicyTotal === activePackages.length,
  `summary.activePolicyTotal=${matrix.summary.activePolicyTotal} but activePolicy.packages.length=${activePackages.length}`);
assert(matrix.summary.legacyObserved === legacyObservedPackages.length,
  `summary.legacyObserved=${matrix.summary.legacyObserved} but legacyObserved.packages.length=${legacyObservedPackages.length}`);
assert(matrix.summary.sourceObserved === sourceObservedPackages.length,
  `summary.sourceObserved=${matrix.summary.sourceObserved} but sourceObserved.packages.length=${sourceObservedPackages.length}`);

// Assertion 2: activePolicyTotal is 30 unless live NuGet adds Hyperlight or another source-observed.
//   Encoded as: total must equal 30 + (activePolicy entries whose name is in the special source-observed set).
const SOURCE_OBSERVED_NAMES = new Set([
  "Microsoft.Agents.AI.Hyperlight",
  "Microsoft.Agents.AI.Mem0",
  "Microsoft.Agents.AI.Workflows.Declarative.Mcp",
]);
const promotedFromSourceObserved = activePackages.filter(p => SOURCE_OBSERVED_NAMES.has(p.name)).length;
assert(matrix.summary.activePolicyTotal === 30 + promotedFromSourceObserved,
  `activePolicyTotal expected 30 + ${promotedFromSourceObserved} promoted source-observed = ${30 + promotedFromSourceObserved}, got ${matrix.summary.activePolicyTotal}`);

// Assertion 3: nugetProfileTotalObserved is 31 (live-verified MicrosoftAgentFramework profile count, 2026-05-05).
assert(matrix.summary.nugetProfileTotalObserved === 31,
  `nugetProfileTotalObserved expected 31, got ${matrix.summary.nugetProfileTotalObserved}`);

// ---------- 4. Stable bucket exact-name allowlist + version regex ----------
const expectedStableNames = [
  "Microsoft.Agents.AI",
  "Microsoft.Agents.AI.Abstractions",
  "Microsoft.Agents.AI.Foundry",
  "Microsoft.Agents.AI.OpenAI",
  "Microsoft.Agents.AI.Workflows",
  "Microsoft.Agents.AI.Workflows.Generators",
].sort();
const actualStableNames = byStatus.stable.map(p => p.name).sort();
assert(eqArr(actualStableNames, expectedStableNames),
  `stable bucket names mismatch:\n  expected: ${expectedStableNames.join(",")}\n  actual:   ${actualStableNames.join(",")}`);
const stableSemverRe = /^\d+\.\d+\.\d+$/;
for (const p of byStatus.stable) {
  assert(stableSemverRe.test(p.version),
    `stable package ${p.name} version ${p.version} must match strict semver /^\\d+\\.\\d+\\.\\d+$/`);
}

// ---------- 5. Active RC bucket exact-name allowlist + version regex ----------
const expectedActiveRcNames = [
  "Microsoft.Agents.AI.Declarative",
  "Microsoft.Agents.AI.Purview",
  "Microsoft.Agents.AI.Workflows.Declarative",
  "Microsoft.Agents.AI.Workflows.Declarative.Foundry",
].sort();
const actualActiveRcNames = rcActive.map(p => p.name).sort();
assert(eqArr(actualActiveRcNames, expectedActiveRcNames),
  `active RC names mismatch:\n  expected: ${expectedActiveRcNames.join(",")}\n  actual:   ${actualActiveRcNames.join(",")}`);
const rcSemverRe = /^\d+\.\d+\.\d+(?:-[Rr][Cc]\d+)?$/;
for (const p of rcActive) {
  assert(rcSemverRe.test(p.version),
    `active RC ${p.name} version ${p.version} must match RC regex /^\\d+\\.\\d+\\.\\d+(?:-[Rr][Cc]\\d+)?$/`);
}

// ---------- 6. Legacy RC names exact ----------
const expectedLegacyRcNames = [
  "Microsoft.Agents.AI.AzureAI",
  "Microsoft.Agents.AI.Workflows.Declarative.AzureAI",
].sort();
const actualLegacyRcNames = rcLegacy.map(p => p.name).sort();
assert(eqArr(actualLegacyRcNames, expectedLegacyRcNames),
  `legacy RC names mismatch:\n  expected: ${expectedLegacyRcNames.join(",")}\n  actual:   ${actualLegacyRcNames.join(",")}`);

// ---------- 7. Legacy RC supersededBy ----------
const expectedSuperseded = {
  "Microsoft.Agents.AI.AzureAI": "Microsoft.Agents.AI.Foundry",
  "Microsoft.Agents.AI.Workflows.Declarative.AzureAI": "Microsoft.Agents.AI.Workflows.Declarative.Foundry",
};
for (const p of rcLegacy) {
  assert(p.supersededBy === expectedSuperseded[p.name],
    `${p.name} supersededBy expected ${expectedSuperseded[p.name]}, got ${p.supersededBy}`);
  assert(p.automerge === false, `${p.name} legacy must have automerge:false`);
  assert(p.dependencyDashboardApproval === true, `${p.name} legacy must require dashboard approval`);
}

// ---------- 8. FoundryMemory not in activePolicy ----------
const foundryMemoryInActive = activePackages.find(p => p.name === "Microsoft.Agents.AI.FoundryMemory");
assert(!foundryMemoryInActive,
  "Microsoft.Agents.AI.FoundryMemory must not appear in activePolicy.packages");
const foundryMemoryInLegacyObserved = legacyObservedPackages.find(p => p.name === "Microsoft.Agents.AI.FoundryMemory");
assert(foundryMemoryInLegacyObserved,
  "Microsoft.Agents.AI.FoundryMemory must appear in legacyObserved.packages");

// ---------- 9. FoundryMemory has no replacementName (in matrix or default.json) ----------
assert(foundryMemoryInLegacyObserved && foundryMemoryInLegacyObserved.replacementName === null,
  "FoundryMemory legacyObserved.replacementName must be null (no replacement asserted unless upstream docs prove it)");

const replacementRules = config.packageRules.filter(r =>
  typeof r.replacementName === "string" && Array.isArray(r.matchPackageNames));
const foundryMemoryReplacementInConfig = replacementRules.find(r =>
  r.matchPackageNames.includes("Microsoft.Agents.AI.FoundryMemory"));
assert(!foundryMemoryReplacementInConfig,
  "default.json must not contain a replacementName rule for Microsoft.Agents.AI.FoundryMemory");

// ---------- 10. Preview/alpha quarantined: not automerged ----------
const previewAlphaActive = [...byStatus.preview, ...byStatus.alpha];
assert(previewAlphaActive.length === byStatus.preview.length + byStatus.alpha.length,
  "preview+alpha bucket length mismatch");

const isMafQuarantine = r => r.groupName === "microsoft-agent-framework-preview-alpha-quarantine";
const quarantine = findRule(isMafQuarantine, "MAF preview/alpha quarantine");
if (quarantine.rule) {
  assert(quarantine.rule.automerge === false, "MAF quarantine rule must have automerge:false");
  assert(quarantine.rule.dependencyDashboardApproval === true,
    "MAF quarantine rule must have dependencyDashboardApproval:true");

  const expectedQuarantineNames = previewAlphaActive.map(p => p.name).sort();
  const actualQuarantineNames = [...quarantine.rule.matchPackageNames].sort();
  assert(eqArr(actualQuarantineNames, expectedQuarantineNames),
    `MAF quarantine matchPackageNames mismatch.\n  expected: ${expectedQuarantineNames.join(",")}\n  actual:   ${actualQuarantineNames.join(",")}`);

  assert(quarantine.rule.allowedVersions === rcRegexLiteral,
    `MAF quarantine allowedVersions expected ${rcRegexLiteral}, got ${quarantine.rule.allowedVersions}`);
  assert(!("matchUpdateTypes" in quarantine.rule),
    "MAF quarantine rule must not combine allowedVersions with matchUpdateTypes");

  // Each quarantine name must be exact (no regex slashes — exact-name allowlists per prompt rule 14).
  for (const n of quarantine.rule.matchPackageNames) {
    assert(!n.startsWith("/") && !n.endsWith("/"),
      `MAF quarantine matchPackageNames must be exact names, got regex-form: ${n}`);
  }
}

// ---------- 11. Stable + active-RC automerge rules: exact-name allowlists ----------
const isMafStable = r => r.groupName === "microsoft-agent-framework-stable";
const isMafRc = r => r.groupName === "microsoft-agent-framework-rc";
const stable = findRule(isMafStable, "MAF stable allowlist");
const rcRule = findRule(isMafRc, "MAF RC allowlist");

if (stable.rule) {
  const got = [...stable.rule.matchPackageNames].sort();
  assert(eqArr(got, expectedStableNames),
    `MAF stable matchPackageNames mismatch.\n  expected: ${expectedStableNames.join(",")}\n  actual:   ${got.join(",")}`);
  for (const n of stable.rule.matchPackageNames) {
    assert(!n.startsWith("/") && !n.endsWith("/"),
      `MAF stable matchPackageNames must be exact names, got regex-form: ${n}`);
  }
  assert(stable.rule.allowedVersions === stableRegexLiteral,
    `MAF stable allowedVersions expected ${stableRegexLiteral}, got ${stable.rule.allowedVersions}`);
  assert(stable.rule.automerge === true, "MAF stable rule must automerge:true");
  assert(!("matchUpdateTypes" in stable.rule),
    "MAF stable rule must not combine allowedVersions with matchUpdateTypes");
}

if (rcRule.rule) {
  const got = [...rcRule.rule.matchPackageNames].sort();
  assert(eqArr(got, expectedActiveRcNames),
    `MAF RC matchPackageNames mismatch.\n  expected: ${expectedActiveRcNames.join(",")}\n  actual:   ${got.join(",")}`);
  for (const n of rcRule.rule.matchPackageNames) {
    assert(!n.startsWith("/") && !n.endsWith("/"),
      `MAF RC matchPackageNames must be exact names, got regex-form: ${n}`);
  }
  assert(rcRule.rule.ignoreUnstable === false, "MAF RC rule must set ignoreUnstable:false");
  assert(rcRule.rule.respectLatest === false, "MAF RC rule must set respectLatest:false");
  assert(rcRule.rule.allowedVersions === rcRegexLiteral,
    `MAF RC allowedVersions expected ${rcRegexLiteral}, got ${rcRule.rule.allowedVersions}`);
  assert(rcRule.rule.automerge === true, "MAF RC rule must automerge:true");
  assert(!("matchUpdateTypes" in rcRule.rule),
    "MAF RC rule must not combine allowedVersions with matchUpdateTypes");
}

// ---------- 12. No broad ^Microsoft\.Agents\.AI automerge rule ----------
config.packageRules.forEach((r, i) => {
  const names = r.matchPackageNames || [];
  const hasBroadMaf = names.some(n =>
    typeof n === "string" && /^\/\^Microsoft\\\.Agents\\\.AI/i.test(n));
  if (hasBroadMaf && r.automerge === true) {
    failures.push(`packageRules[${i}] is a broad Microsoft.Agents.AI regex with automerge:true — forbidden`);
  }
});

// ---------- 13. No packageRule combines allowedVersions and matchUpdateTypes ----------
config.packageRules.forEach((r, i) => {
  if (r.allowedVersions && r.matchUpdateTypes) {
    failures.push(`packageRules[${i}] combines allowedVersions and matchUpdateTypes — forbidden`);
  }
});

// ---------- 14. allowedVersions regex behavior ----------
const stableRe = compileAllowedVersionsRegex(stableRegexLiteral);
const rcRe = compileAllowedVersionsRegex(rcRegexLiteral);

const stableShouldAccept = ["1.4.0", "2.0.0"];
const stableShouldReject = ["1.4.0-rc1", "1.4.0-preview.260505.1", "1.4.0-alpha.260505.1", "1.4.0-beta.1"];
for (const v of stableShouldAccept) {
  assert(stableRe.test(v), `stable regex must accept ${v}`);
}
for (const v of stableShouldReject) {
  assert(!stableRe.test(v), `stable regex must reject ${v}`);
}
const rcShouldAccept = ["1.4.0", "1.4.0-rc1", "1.0.0-rc5", "2.0.0-RC1"];
const rcShouldReject = [
  "1.4.0-preview.260505.1",
  "1.4.0-alpha.260505.1",
  "1.4.0-beta.1",
  "1.4.0-dev.1",
  "1.4.0-nightly.1",
  "1.3.0-preview.1.26251.3",
];
for (const v of rcShouldAccept) {
  assert(rcRe.test(v), `rc/quarantine regex must accept ${v}`);
}
for (const v of rcShouldReject) {
  assert(!rcRe.test(v), `rc/quarantine regex must reject ${v}`);
}

// ---------- 15. Source-observed packages do not affect activePolicy counts ----------
for (const sp of sourceObservedPackages) {
  assert(sp.activePolicy === false,
    `sourceObserved.${sp.name}.activePolicy must be false`);
  assert(typeof sp.reason === "string" && sp.reason.length > 0,
    `sourceObserved.${sp.name} must have a non-empty reason`);
  // Source-observed names must not also be in activePolicy unless verified-and-promoted.
  // The activePolicyTotal assertion above already enforces the count side; here we only
  // ensure the matrix doesn't double-list.
  assert(!activePackages.find(p => p.name === sp.name),
    `source-observed package ${sp.name} must not also appear in activePolicy.packages`);
}

// ---------- 17. platformAutomerge documented in README with branch-protection warning ----------
assert(config.platformAutomerge === true || config.platformAutomerge === undefined,
  "platformAutomerge value sanity-check");
if (config.platformAutomerge === true) {
  assert(/platformAutomerge/i.test(readme) && /branch protection/i.test(readme) && /required.*status check/i.test(readme),
    "README must document platformAutomerge with the GitHub branch-protection warning (status checks required before merge)");
}

// ---------- 18. Replacement rules exist only for verified replacement paths ----------
const expectedReplacements = {
  "Microsoft.Agents.AI.AzureAI": { name: "Microsoft.Agents.AI.Foundry", version: "1.4.0" },
  "Microsoft.Agents.AI.Workflows.Declarative.AzureAI": { name: "Microsoft.Agents.AI.Workflows.Declarative.Foundry", version: "1.4.0-rc1" },
};
const replacementByFrom = {};
for (const r of replacementRules) {
  assert(r.matchPackageNames.length === 1,
    `replacement rule should target exactly one package: ${JSON.stringify(r.matchPackageNames)}`);
  if (r.matchPackageNames.length === 1) {
    replacementByFrom[r.matchPackageNames[0]] = r;
  }
}
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
const allowedReplacementSources = new Set(Object.keys(expectedReplacements));
for (const from of Object.keys(replacementByFrom)) {
  assert(allowedReplacementSources.has(from),
    `unexpected replacement rule for ${from} (only verified paths allowed)`);
}

// ---------- 19, 20, 21. Hyperlight / Mem0 / Workflows.Declarative.Mcp explicit classification ----------
const SPECIAL_TARGETS = [
  "Microsoft.Agents.AI.Hyperlight",
  "Microsoft.Agents.AI.Mem0",
  "Microsoft.Agents.AI.Workflows.Declarative.Mcp",
];
for (const name of SPECIAL_TARGETS) {
  const inActive = activePackages.find(p => p.name === name);
  const inSource = sourceObservedPackages.find(p => p.name === name);
  assert(Boolean(inActive) !== Boolean(inSource),
    `${name} must be classified in exactly one of activePolicy or sourceObserved (got active=${Boolean(inActive)}, sourceObserved=${Boolean(inSource)})`);
  if (inActive) {
    assert(STATUSES.has(inActive.status),
      `promoted ${name} must have a known status (stable/rc/preview/alpha), got ${inActive.status}`);
    assert(typeof inActive.version === "string" && inActive.version.length > 0,
      `promoted ${name} must record a version`);
  }
  if (inSource) {
    assert(typeof inSource.reason === "string" && inSource.reason.length > 0,
      `${name} sourceObserved entry must have a non-empty reason`);
  }
}

// ---------- Disabled rule for FoundryMemory ----------
const foundryMemoryDisabledRule = config.packageRules.find(r =>
  Array.isArray(r.matchPackageNames) &&
  r.matchPackageNames.length === 1 &&
  r.matchPackageNames[0] === "Microsoft.Agents.AI.FoundryMemory" &&
  r.enabled === false);
assert(foundryMemoryDisabledRule,
  "default.json must contain a packageRule disabling Renovate for Microsoft.Agents.AI.FoundryMemory (enabled:false, exact match)");

// ---------- Rule ordering: stable + RC must come AFTER global major manual-review ----------
const isGlobalMajor = r => Array.isArray(r.matchUpdateTypes) && r.matchUpdateTypes.includes("major")
  && !r.groupName && r.automerge === false;
const major = findRule(isGlobalMajor, "global major manual-review");
if (major.idx !== -1) {
  if (stable.idx !== -1) {
    assert(stable.idx > major.idx,
      `MAF stable rule (idx ${stable.idx}) must come AFTER global major rule (idx ${major.idx})`);
  }
  if (rcRule.idx !== -1) {
    assert(rcRule.idx > major.idx,
      `MAF RC rule (idx ${rcRule.idx}) must come AFTER global major rule (idx ${major.idx})`);
  }
}

// ---------- Active-policy package sort order: status (stable, rc, preview, alpha) then name ----------
const sortedExpected = [...activePackages].sort((a, b) => {
  const sa = STATUS_ORDER.indexOf(a.status);
  const sb = STATUS_ORDER.indexOf(b.status);
  if (sa !== sb) return sa - sb;
  return a.name.localeCompare(b.name);
});
for (let i = 0; i < activePackages.length; i++) {
  assert(activePackages[i].name === sortedExpected[i].name,
    `activePolicy.packages not sorted: at index ${i} expected ${sortedExpected[i].name}, got ${activePackages[i].name}`);
}

// ---------- README must document the 2026-05-05 dotnet-1.4.0 policy ----------
assert(/2026-05-05/.test(readme), "README must reference 2026-05-05");
assert(/dotnet-1\.4\.0|1\.4\.0\b/.test(readme), "README must reference the dotnet-1.4.0 release line");
assert(/30\b.*active|active.*30\b/i.test(readme),
  "README must state the active policy total of 30");
assert(/31\b.*profile|profile.*31\b/i.test(readme),
  "README must state the NuGet profile total of 31");
assert(/FoundryMemory/.test(readme),
  "README must mention FoundryMemory");
assert(/Mem0/.test(readme),
  "README must mention Mem0");
assert(/Hyperlight/.test(readme),
  "README must mention Hyperlight");
assert(/(Mcp\b|Workflows\.Declarative\.Mcp)/.test(readme),
  "README must mention Workflows.Declarative.Mcp");
assert(/rollback/i.test(readme),
  "README must include a rollback section");

// ---------- summary ----------
if (failures.length > 0) {
  console.error("MAF config assertion failures:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}

const totals = {
  active: activePackages.length,
  stable: byStatus.stable.length,
  rc: byStatus.rc.length,
  activeRc: rcActive.length,
  legacyRc: rcLegacy.length,
  preview: byStatus.preview.length,
  alpha: byStatus.alpha.length,
  legacyObserved: legacyObservedPackages.length,
  sourceObserved: sourceObservedPackages.length,
  replacements: replacementRules.length,
  profileTotal: matrix.summary.nugetProfileTotalObserved,
};
console.log(`MAF config OK — asOf=${matrix.asOf} releaseLine=${matrix.releaseLine}`);
console.log(`  activePolicy: ${totals.active} (stable=${totals.stable} rc=${totals.rc}[active=${totals.activeRc} legacy=${totals.legacyRc}] preview=${totals.preview} alpha=${totals.alpha})`);
console.log(`  legacyObserved: ${totals.legacyObserved}, sourceObserved: ${totals.sourceObserved}, replacements: ${totals.replacements}`);
console.log(`  nugetProfileTotalObserved: ${totals.profileTotal} (live-verified)`);
