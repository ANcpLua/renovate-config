# ANcpLua Renovate Config

Shared Renovate preset for the ANcpLua framework: `ANcpLua.NET.Sdk`,
`ANcpLua.Roslyn.Utilities`, `ANcpLua.Analyzers`, `ANcpLua.Agents`.

## What this preset does

- Replaces hand-rolled `renovate.json` files with one shared baseline.
- Groups dependency updates by ecosystem (Roslyn, Microsoft.Extensions, AI
  clients, Meziantou, testing, OpenAPI, OpenTelemetry).
- Defaults patch + lockfile-maintenance + npm devDep-minor to automerge.
- Adds `customManagers` so Renovate can bump the `Version.props` symbolic-name
  layer the consumer repos sit on top of CPM (see "Why an indirection above
  CPM?" below).
- Treats Microsoft Agent Framework packages as a status-tracked matrix instead
  of a single regex (see below).

## Why an indirection above CPM?

Renovate handles native NuGet `PackageReference` and CPM `PackageVersion`
literals (e.g. `<PackageVersion Include="Foo" Version="1.2.3" />`) out of the
box — and has since v23.67.0 (June 2020). The
[2018 issue about MSBuild-property versions][r2266] was closed in November
2020 with the recommendation to use CPM instead.

The consumer repos in this family deliberately add an extra symbolic-name
layer above CPM. Each `Directory.Packages.props` references variables defined
in a sibling `Version.props`:

```xml
<!-- Version.props -->
<MicrosoftAgentsAIVersion>1.3.0</MicrosoftAgentsAIVersion>

<!-- Directory.Packages.props -->
<PackageVersion Include="Microsoft.Agents.AI" Version="$(MicrosoftAgentsAIVersion)" />
<PackageVersion Include="Microsoft.Agents.AI.Foundry" Version="$(MicrosoftAgentsAIVersion)" />
```

Renovate cannot follow `$(VarName)` substitution from CPM into a separate
file, so the `customManagers` here parse `Version.props` directly via regex.
This is a deliberate ergonomic choice — one bump to a symbolic name flows to
every package in the family across every consumer — not a workaround for a
missing Renovate feature. If a consumer drops the indirection and inlines
literal versions in CPM, ~80% of these `customManagers` become redundant and
Renovate's native NuGet manager takes over.

[r2266]: https://github.com/renovatebot/renovate/issues/2266

## Usage

```jsonc
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["github>ANcpLua/renovate-config"]
}
```

Per-repo self-bump pattern (in the consumer's local `renovate.json`):

| Repo | Pattern |
|---|---|
| `ANcpLua.NET.Sdk` | `/^ANcpLua\\.NET\\.Sdk/` |
| `ANcpLua.Roslyn.Utilities` | `/^ANcpLua\\.Roslyn\\.Utilities/` |
| `ANcpLua.Analyzers` | `/^ANcpLua\\.Analyzers/`, `/^Dummy/` |
| `ANcpLua.Agents` | `/^ANcpLua\\.Agents/` |

## Microsoft Agent Framework package policy (2026-05-05)

The full matrix lives in [`data/microsoft-agent-framework-packages.json`](data/microsoft-agent-framework-packages.json).
Summary:

- **stable**: 6
- **rc**: 6 (4 active, 2 superseded)
- **preview**: 18 (17 active, 1 superseded)
- **alpha**: 1
- **total**: 31

Renovate treats each package by status. The previous broad
`/^Microsoft\.Agents\.AI/` automerge rule has been removed — it accepted
preview/alpha builds for stable consumers, and blocked RC bumps because of a
generic `matchCurrentVersion: /-(preview|rc|alpha|beta)/` opt-out below it.

### Stable-track packages

`allowedVersions` is `/^\d+\.\d+\.\d+$/`. Stable releases automerge, including
majors. Preview/alpha/beta/dev builds are intentionally excluded — Renovate
will not propose them.

| Package | Description |
|---|---|
| Microsoft.Agents.AI | Core functionality |
| Microsoft.Agents.AI.Abstractions | Interfaces and abstractions |
| Microsoft.Agents.AI.Foundry | Foundry Agents support |
| Microsoft.Agents.AI.OpenAI | OpenAI support |
| Microsoft.Agents.AI.Workflows | Workflows support |
| Microsoft.Agents.AI.Workflows.Generators | Roslyn source generators |

### RC-track packages

`allowedVersions` is `/^\d+\.\d+\.\d+(?:-rc(?:\.?\d+(?:\.\d+)*)?)?$/i` and the
rule sets `ignoreUnstable: false` + `respectLatest: false` so Renovate will
consider RC builds. Stable and `-rc` versions automerge, including majors.
Preview/alpha/beta/dev builds are intentionally excluded.

| Package | Description |
|---|---|
| Microsoft.Agents.AI.Declarative | Declarative agents support |
| Microsoft.Agents.AI.Purview | Purview integration |
| Microsoft.Agents.AI.Workflows.Declarative | Declarative workflows support |
| Microsoft.Agents.AI.Workflows.Declarative.Foundry | Declarative workflows for Foundry |

### Legacy/superseded packages

Each has a `replacementName` rule pointing at its replacement. These are
**migration candidates**, not normal automerge candidates: `automerge: false`,
`dependencyDashboardApproval: true`.

| Package | Replacement | Notes |
|---|---|---|
| Microsoft.Agents.AI.AzureAI (1.0.0-rc5) | Microsoft.Agents.AI.Foundry (1.3.0) | AzureAI naming retired |
| Microsoft.Agents.AI.Workflows.Declarative.AzureAI (1.0.0-rc5) | Microsoft.Agents.AI.Workflows.Declarative.Foundry (1.3.0-rc1) | AzureAI naming retired |
| Microsoft.Agents.AI.FoundryMemory (1.0.0-preview.260330.1) | Microsoft.Agents.AI.Foundry (1.3.0) | Memory consolidated into Foundry |

### Preview/alpha quarantine packages

`allowedVersions` matches stable or `-rc` only — Renovate **never** suggests
new preview/alpha builds. If a future stable or RC publishes, the PR opens but
does not automerge (`automerge: false`, `dependencyDashboardApproval: true`).

Includes the 17 preview-track packages without supersession plus the single
alpha package (`Microsoft.Agents.AI.Hosting.OpenAI`). See the matrix file for
the full list.

## Automerge policy

| Dimension | Behavior |
|---|---|
| Patch bumps (any ecosystem) | Automerge on green CI |
| npm devDependencies, minor | Automerge on green CI |
| Lockfile maintenance + digest pins | Automerge always |
| Major bumps (default) | **Manual review**, label `major` |
| MAF stable allowlist | Automerge **including majors**, stable versions only |
| MAF RC allowlist | Automerge **including majors**, stable + RC versions only |
| MAF preview/alpha quarantine | Manual approval, no preview/alpha proposals |
| MAF replacements | Manual approval — migration intent |
| `.NET SDK` (`global.json`) | Stable channel only (`x.y.z`) |

`packageRules` are order-sensitive: the global "majors require manual review"
rule precedes the MAF stable + RC allowlist rules, so the allowlists override
it. This is how MAF stable/RC majors automerge while everything else still
needs human review for major upgrades.

## Version.props custom manager caveats

- **`replacementName`/`replacementVersion` does not work for `customManagers`
  (`customType: "regex"`).** It applies only to native managers like
  `nuget`/`PackageReference`. If a consumer uses `Version.props` indirection
  for a superseded package, Renovate will still file an *update* PR via the
  regex manager, but the rename to the new package id has to be done by hand.
  The PR body for each replacement rule states this explicitly.
- **Heterogeneous families**: `OpenTelemetryVersion` uses `OpenTelemetry.Api`
  as canary, but instrumentation packages can lag the umbrella by a release.
  Same for `MicrosoftExtensionsVersion` (canary:
  `Microsoft.Extensions.Diagnostics.Testing`).
- **`AspNetCoreVersion`** uses `Microsoft.AspNetCore.Mvc.Testing` as canary,
  matching what consumers actually reference.
- **`ANcpSdkPackageVersion=999.9.9`** is intentionally NOT a custom manager —
  it's a build-time placeholder, not a real dependency.
- All 31 MAF packages have a corresponding custom manager entry following the
  established `Microsoft.Agents.AI.X.Y` → `<MicrosoftAgentsAIXYVersion>` PascalCase
  property naming. `Aspire.Hosting.AgentFramework.DevUI` follows the same
  convention as `<AspireHostingAgentFrameworkDevUIVersion>`.

## Validation

This repo ships a Node validator and a workflow that runs it on every push.

```bash
npm install      # nothing to install — only built-in modules
npm run test     # asserts default.json + matrix consistency, regex behavior, rule ordering
npm run validate # runs the test plus renovate-config-validator --strict --no-global
```

The validator script (`scripts/assert-maf-config.mjs`) asserts:

- The matrix has exactly 6 stable / 6 rc / 18 preview / 1 alpha / 31 total.
- Every package name is unique and lives in exactly one bucket.
- The MAF stable rule names exactly the 6 stable packages.
- The MAF RC rule names exactly the 4 active RC packages, **not** the 2
  superseded ones.
- The MAF quarantine rule names exactly the 17 active preview packages plus
  the 1 alpha package (18 total).
- The 3 superseded packages have replacement rules pointing at the documented
  replacement names + versions.
- No `packageRule` combines `allowedVersions` and `matchUpdateTypes` (forbidden
  by Renovate).
- No broad `^Microsoft\.Agents\.AI` regex automerge rule survives.
- The MAF stable + RC allowlist rules come **after** the global major
  manual-review rule so they can override it.
- The stable `allowedVersions` regex accepts `1.3.0` and rejects `-rc1`,
  `-preview.*`, `-alpha.*`, `-beta.1`.
- The RC `allowedVersions` regex accepts `1.3.0`, `1.3.0-rc1`, `1.3.0-rc.1`
  and rejects `-preview.*`, `-alpha.*`, `-beta.1`, `-dev.1`, `-nightly.1`.

CI runs Node 22 LTS and executes `npm run validate`.

## Rollback

If MAF auto-merge bumps surface unexpected breakage, the safest rollbacks are
each independent of the others:

1. **Disable MAF major automerge only** — remove the stable + RC rules but
   keep `customManagers`. Falls back to the global "majors need manual review"
   rule for MAF.
2. **Quarantine everything MAF** — copy the quarantine rule's matchPackageNames
   into the stable + RC rules (or just delete those rules), turning every MAF
   package into manual-review.
3. **Drop `customManagers`** — if the indirection makes too many concurrent
   PRs after a quiet week, removing the array still leaves grouping +
   automerge baseline working for the rest.
