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

## Microsoft Agent Framework matrix (2026-05-05, dotnet-1.4.0)

Authoritative data: [`data/microsoft-agent-framework-packages.json`](data/microsoft-agent-framework-packages.json).

The matrix tracks the upstream `microsoft/agent-framework` **dotnet-1.4.0** release line as observed on NuGet.org on 2026-05-05.

**Active policy: 30 packages** (unless live NuGet.org verification adds a newly published source-observed package — see below):

| Track | Count | Behavior |
|---|---|---|
| Stable | 6 | `allowedVersions: /^\d+\.\d+\.\d+$/` — automerge incl. majors, stable only |
| RC active | 4 | `allowedVersions: /^\d+\.\d+\.\d+(?:-[Rr][Cc]\d+)?$/` + `ignoreUnstable:false` + `respectLatest:false` — automerge incl. majors, stable + `-rcN` only |
| RC legacy | 2 | `Microsoft.Agents.AI.AzureAI` (→ `Foundry`), `Microsoft.Agents.AI.Workflows.Declarative.AzureAI` (→ `Workflows.Declarative.Foundry`) — `automerge:false`, `dependencyDashboardApproval:true`, manual approval |
| Preview quarantine | 17 | Same allowed-versions regex as active RC; `automerge:false` + `dependencyDashboardApproval:true`. Renovate cannot propose new preview bumps; only graduation PRs to stable/RC open |
| Alpha quarantine | 1 | `Microsoft.Agents.AI.Hosting.OpenAI`. Same quarantine behavior; can only graduate to RC/stable with manual approval |

### NuGet.org profile vs active policy — why the count differs

The MicrosoftAgentFramework NuGet.org profile shows **31 packages**. The active policy matrix is **30**. The difference is `Microsoft.Agents.AI.FoundryMemory`:

- It is an **old preview package** (`1.0.0-preview.260330.1`) on the profile.
- It is **intentionally excluded from active 1.4 policy** as `legacyObserved` / old preview.
- Renovate is disabled for it (`enabled: false` packageRule). The customManager keeps the `Version.props` symbol parsable in consumer repositories without proposing updates.
- **No `replacementName` is asserted**, because upstream documentation does not explicitly confirm a replacement path. Consumers must migrate manually if needed.

### Source-observed packages (excluded from active policy)

These exist as `.csproj` projects in `microsoft/agent-framework dotnet/src` but are **not treated as NuGet.org dependencies** until live NuGet.org publication is verified. Promotion to active policy requires re-running the live verification:

- **`Microsoft.Agents.AI.Mem0`** — source-observed unless NuGet.org publication is verified. A single preview was published but is currently **unlisted** by Microsoft and is not on the MicrosoftAgentFramework profile (the 31 count). Re-list or republish would qualify it for activePolicy promotion.
- **`Microsoft.Agents.AI.Workflows.Declarative.Mcp`** — source-or-GitHub-Packages observed unless NuGet.org publication is verified. GitHub Packages publication is **not** the same as NuGet.org publication.
- **`Microsoft.Agents.AI.Hyperlight`** — must be verified live because the `dotnet-1.4.0` release notes mention it but the NuGet.org profile snapshot does not include it. If live NuGet.org lookup confirms publication, classify by detected version (stable/rc/preview/alpha) and promote into activePolicy with updated counts.

Live verification command per package:

```bash
curl -fsSL "https://api.nuget.org/v3-flatcontainer/<lowercase-package-id>/index.json"
```

Profile-level package list:

<https://www.nuget.org/profiles/MicrosoftAgentFramework>

### Replacement rules

Only **two** replacement rules are configured, and only for verified replacement paths:

| From | To | replacementVersion |
|---|---|---|
| `Microsoft.Agents.AI.AzureAI` | `Microsoft.Agents.AI.Foundry` | `1.4.0` |
| `Microsoft.Agents.AI.Workflows.Declarative.AzureAI` | `Microsoft.Agents.AI.Workflows.Declarative.Foundry` | `1.4.0-rc1` |

`replacementName` does **not** apply to `customManagers` (`customType: "regex"`) — for `Version.props` indirection, the replacement PR opens but the symbolic-property rename is manual. Each replacement rule's `prBodyNotes` flags this limitation.

## Other automerge rules

| Dimension | Behavior |
|---|---|
| Patch bumps (any ecosystem) | Automerge on green CI |
| npm devDependencies, minor | Automerge on green CI |
| Lockfile maintenance + digest pins | Automerge always |
| Major bumps (default) | Manual review |
| `.NET SDK` (`global.json`) | Stable channel only (`x.y.z`) |
| `platformAutomerge: true` | Uses GitHub's native auto-merge. **Requires GitHub branch protection** with **required status checks** enabled for the target branch — without that, automerge is unsafe because PRs can merge without CI gating |
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

- **Return MAF majors to manual review** — remove the stable + active-RC allowlist `automerge` rules; the global "majors → manual review" rule then handles MAF again.
- **Drop `Version.props` indirection** — remove the MAF `customManagers` once consumer repos stop using `Version.props` symbolic-property indirection; CPM literals then fall back to Renovate's native NuGet manager.
- **Remove legacy observed blocks** — only after every consumer repository has been verified to no longer reference the affected legacy/observed package ids (e.g., `Microsoft.Agents.AI.FoundryMemory`); otherwise Renovate stops parsing the symbol entirely and consumer pins go silent.
