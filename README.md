# ANcpLua Renovate Config

Shared Renovate preset for `ANcpLua.NET.Sdk`, `ANcpLua.Roslyn.Utilities`,
`ANcpLua.Analyzers`, `ANcpLua.Agents`.

## Usage

### 1. Renovate preset

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

### 2. Auto-merge reusable workflow

`.github/workflows/auto-merge-reusable.yml` is a [reusable workflow](https://docs.github.com/en/actions/using-workflows/reusing-workflows) — single source of truth for auto-merge tiers across the framework. Each consumer repo has a thin caller:

```yaml
# .github/workflows/auto-merge.yml in each consumer repo
name: Auto-merge
on:
  pull_request_target:
    types: [opened, synchronize, reopened, ready_for_review]
  pull_request_review:
    types: [submitted]
permissions:
  contents: write
  pull-requests: write
jobs:
  auto-merge:
    uses: ANcpLua/renovate-config/.github/workflows/auto-merge-reusable.yml@main
    secrets: inherit
```

**Required secrets** (per consumer repo, or org-level if available):
- `AUTOMERGE_APP_ID` — GitHub App ID
- `AUTOMERGE_APP_PRIVATE_KEY` — full PEM contents of the App's private key

**Why a GitHub App, not GITHUB_TOKEN?** When auto-merge fires under GITHUB_TOKEN identity, the resulting `push: main` event is silently filtered by GitHub's anti-loop protection — downstream publish workflows never run. Using an App installation token makes the App the merge actor, so push events fire normally. See [GitHub docs](https://docs.github.com/en/actions/security-guides/automatic-token-authentication).

**One-time App setup**:
1. Create a GitHub App at <https://github.com/settings/apps/new> with permissions: Repository → Contents (Write), Pull requests (Write).
2. Generate a private key, download the `.pem` file.
3. Install the App on each consumer repo (or org-wide).
4. In each repo's secrets, set `AUTOMERGE_APP_ID` (the numeric App ID) and `AUTOMERGE_APP_PRIVATE_KEY` (full PEM contents including BEGIN/END lines).

## Why customManagers exist

Renovate handles native NuGet `PackageReference` and CPM `PackageVersion`
literals out of the box (since [v23.67.0][rel], 2020-11-01); the
[2018 issue about MSBuild-property versions][r2266] was closed in favor of
CPM that same week. The consumer repos here add a symbolic-name layer
(`Version.props`) above CPM and reference variables via `$(VarName)` in
`Directory.Packages.props`. Renovate cannot follow that substitution into a
separate file, so the `customManagers` parse `Version.props` directly. If a
consumer drops the indirection and inlines literal versions in CPM, every
custom manager here becomes redundant and Renovate's native NuGet manager
takes over.

[rel]: https://github.com/renovatebot/renovate/releases/tag/23.67.0
[r2266]: https://github.com/renovatebot/renovate/issues/2266

## Microsoft Agent Framework matrix (2026-05-05)

Authoritative local data: [`data/microsoft-agent-framework-packages.json`](data/microsoft-agent-framework-packages.json). The active NuGet.org profile count is 31 packages: 6 stable, 6 RC (4 active, 2 superseded), 18 preview (17 active, 1 superseded), and 1 alpha.

| Track | Behavior |
|---|---|
| Stable (6) | `allowedVersions: /^\d+\.\d+\.\d+$/` — automerge including majors, stable only |
| RC (4 active) | `allowedVersions: /^\d+\.\d+\.\d+(?:-[Rr][Cc]\d+)?$/` + `ignoreUnstable:false` — automerge including majors, stable or `-rcN` only |
| Preview/alpha quarantine (19 names) | Same allowed-versions regex as RC; `automerge:false` + `dependencyDashboardApproval:true`. Renovate cannot propose new preview/alpha bumps; only graduation PRs to stable/RC can open, and those require manual approval unless explicitly allowlisted |
| Superseded (3) | `replacementName` rules → `Foundry` family, manual approval |

Stable allowlist:

```text
Microsoft.Agents.AI
Microsoft.Agents.AI.Abstractions
Microsoft.Agents.AI.Foundry
Microsoft.Agents.AI.OpenAI
Microsoft.Agents.AI.Workflows
Microsoft.Agents.AI.Workflows.Generators
```

Active RC allowlist:

```text
Microsoft.Agents.AI.Declarative
Microsoft.Agents.AI.Purview
Microsoft.Agents.AI.Workflows.Declarative
Microsoft.Agents.AI.Workflows.Declarative.Foundry
```

Source or alternate-feed observations are recorded as tripwires, not as active NuGet.org allowlist entries:

| Package | Status |
|---|---|
| `Microsoft.Agents.AI.Hyperlight` | Source-observed for Hyperlight CodeAct integration; not in the MicrosoftAgentFramework NuGet.org profile |
| `Microsoft.Agents.AI.Mem0` | Source-observed in `dotnet-1.4.0`; the project has `IsPackable=false`. A live NuGet.org flat-container lookup also returned an older `1.0.0-preview.251028.1`, so this stays out of the active allowlist until package ownership/profile status is verified |
| `Microsoft.Agents.AI.Workflows.Declarative.Mcp` | Source/GitHub-Packages observed; NuGet.org flat-container lookup returned 404. Do not treat it as a NuGet.org allowlist package unless publication is verified |
| `Microsoft.Agents.AI.Hosting.AzureAIResponses` | GitHub-Packages observed alpha; not in the MicrosoftAgentFramework NuGet.org profile |

**`replacementName` does not apply to `customManagers` (`customType: "regex"`)** — for `Version.props` indirection, the replacement PR opens but the property rename is manual. Each replacement-rule's `prBodyNotes` says so.

## Other automerge rules

| Dimension | Behavior |
|---|---|
| Patch bumps (any ecosystem) | Automerge on green CI |
| npm devDependencies, minor | Automerge on green CI |
| Lockfile maintenance + digest pins | Automerge always |
| Major bumps (default) | Manual review |
| `.NET SDK` (`global.json`) | Stable channel only (`x.y.z`) |
| `platformAutomerge: true` | Requires GitHub branch protection with required status checks before merging |
| `prHourlyLimit: 2` / `prConcurrentLimit: 5` | Caps Renovate PR rate per repo |

Rule order matters: the global "majors → manual review" rule sits **before**
the MAF stable + RC allowlists, so the allowlists override it.

## Default-deny unstable

Two early `packageRules` reject prereleases by default:

- **npm**: `allowedVersions: !/(?:alpha|beta|rc|preview|pre|dev|canary|next|nightly)/i`
- **NuGet**: `allowedVersions: !/(?:alpha|beta|preview|pre|dev|experimental|nightly)/i` (note: `rc` is **allowed** — the MAF RC track and other Microsoft RC packages still flow through)

A follow-up exception rule resets `allowedVersions` for packages where the
deny would freeze legitimate prerelease pins:

- All first-party `^ANcpLua\.` packages (you control the cadence)
- `Microsoft.OpenApi.Readers` — upstream has no stable 2.0
- `JonSkeet.RoslynAnalyzers` — upstream beta-only

The MAF stable / RC / quarantine rules later in the file set their own
`allowedVersions` and override the global default-deny for matrix packages.

## Validation

`npm run validate` runs `scripts/assert-maf-config.mjs` (matrix consistency,
regex behavior, rule ordering, no broad MAF automerge regex) and
`renovate-config-validator --strict --no-global default.json`. CI
([`.github/workflows/validate.yml`](.github/workflows/validate.yml)) does the
same on every push and PR. See the script for the exact assertion list.

## Rollback

- **Disable MAF major automerge only** — drop the stable + RC allowlist rules; the global "majors → manual review" rule handles MAF again.
- **Quarantine all MAF** — delete the stable + RC rules; everything in the matrix becomes manual review.
- **Drop the indirection** — remove `customManagers`; CPM literals fall back to Renovate's native NuGet manager.
