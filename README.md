# ANcpLua Framework Conventions & Renovate Config

Canonical home for the four ANcpLua framework repos:
[`ANcpLua.Roslyn.Utilities`](https://github.com/ANcpLua/ANcpLua.Roslyn.Utilities),
[`ANcpLua.NET.Sdk`](https://github.com/ANcpLua/ANcpLua.NET.Sdk),
[`ANcpLua.Analyzers`](https://github.com/ANcpLua/ANcpLua.Analyzers),
[`ANcpLua.Agents`](https://github.com/ANcpLua/ANcpLua.Agents).

This repo holds:
1. The shared **Renovate preset** every framework repo extends.
2. The framework's **CI / auto-merge / branch-protection / review conventions**
   (this README).
3. The **operations cookbook** for adding a new framework repo (also here).

If a contributor or agent ever asks "what's the right way to set up auto-merge /
CodeRabbit / branch protection on a framework repo," the answer is *this file*.
Don't redocument it per-repo; each repo's `AGENTS.md` links here.

---

## Layer architecture

```
LAYER 0: ANcpLua.Roslyn.Utilities  ← Roslyn helpers (TypeCache, SymbolMatch, extensions)
LAYER 1: ANcpLua.NET.Sdk           ← MSBuild SDK (Version.props is source of truth)
LAYER 2: ANcpLua.Analyzers         ← 90 diagnostics, auto-injected by the SDK
         ANcpLua.Agents            ← MAF runtime helpers + agent test infrastructure
LAYER 3: end-user repos (qyl, TourPlanner, ...)
```

**Truth source for package versions** is
[`ANcpLua.NET.Sdk/src/Build/Common/Version.props`](https://github.com/ANcpLua/ANcpLua.NET.Sdk/blob/main/src/Build/Common/Version.props),
shipped inside the SDK NuGet and resolved automatically for every consumer. A
local `Version.props` at the root of any framework repo is imported *after*
the SDK copy (last-wins) — only for pinning AHEAD of the currently-published
SDK. Drift in a local copy that's behind/equal to the SDK is silent
regression, not a feature; prune local entries once the SDK publishes
matching values.

---

## Framework conventions

### Auto-merge (the 2026 pattern: native, no GitHub App)

**Don't recreate the `AUTOMERGE_APP_ID` GitHub App.** It was deleted on
2026-05-12 as an antipattern: single point of failure across four repos,
maintenance overhead, and redundant with native mechanisms.

**What handles what:**

| PR source | How it auto-merges |
|---|---|
| Renovate bot PRs | Renovate's `platformAutomerge: true` (default) + this preset's `automerge: true` rules → enables GitHub native auto-merge at PR-open time. **No workflow involvement.** |
| Owner / `claude/` / `copilot/` / `jules/` branches | Inline workflow runs `gh pr merge --auto --squash` with `GITHUB_TOKEN`. |
| CodeRabbit-approved PRs | Same workflow, on `pull_request_review` with `state == approved` and `user.login == coderabbitai[bot]`. |

The canonical workflow lives at
[`ANcpLua.Analyzers/.github/workflows/auto-merge.yml`](https://github.com/ANcpLua/ANcpLua.Analyzers/blob/main/.github/workflows/auto-merge.yml)
(byte-identical across all four framework repos). To add it to a new repo,
copy that file as-is.

**Why GITHUB_TOKEN is enough here:**
- Branch protection requires **0 approvals**, so the App's classic
  cross-author-approval value-add is moot.
- `nuget-publish.yml` in each repo is gated on `push: tags v*` (manual tag),
  not `push: main`, so the GitHub anti-loop filtering of GITHUB_TOKEN-driven
  push events does not break the publish chain.
- Branch protection still gates the actual merge on required status checks
  even when auto-merge is armed by GITHUB_TOKEN.

### Repo settings (one-time, per framework repo)

```bash
# Required for native auto-merge to work at all.
gh api -X PATCH repos/ANcpLua/<repo> -F allow_auto_merge=true

# Verify (must return true).
gh api repos/ANcpLua/<repo> -q .allow_auto_merge
```

Verified `true` on all four framework repos as of 2026-05-13.

### CodeRabbit posture (`.coderabbit.yaml`)

```yaml
reviews:
  request_changes_workflow: false  # advisory only — comments don't block auto-merge
```

A `Request Changes` review blocks GitHub native auto-merge **even with 0
required approvals on branch protection**. With `false`, CodeRabbit posts
comments instead of `Request Changes` reviews, so its feedback never freezes
a PR while the owner is away. Set on all four framework repos as of
2026-05-13.

### Branch protection (all four repos)

- PR required to merge into `main` (**0 approvals**, **squash** preferred)
- Required status checks must pass (the per-repo CI job names)
- Branch must be up-to-date with `main` before merge
- Force push and branch deletion **blocked** on `main`
- Conversation-resolution **not** required (comments don't gate merges)
- Optional checks (CodeRabbit, GitGuardian, Copilot review) don't block

### Required CI status checks (per repo)

| Repo | Required checks |
|---|---|
| `ANcpLua.Roslyn.Utilities` | `build (ubuntu/windows)`, `version` |
| `ANcpLua.NET.Sdk` | `compute_version`, `lint_config`, `test (ubuntu/windows/macos)`, `create_nuget` |
| `ANcpLua.Analyzers` | `build`, `test (ubuntu/windows/macos)` |
| `ANcpLua.Agents` | `build (ubuntu/windows/macos)`, `version` |

### Release flow

| Repo | Trigger | Auto GH release? |
|---|---|---|
| `ANcpLua.NET.Sdk` | auto-bump-on-merge → auto-tag | yes |
| `ANcpLua.Roslyn.Utilities` | manual `git tag vX.Y.Z && git push --tags` | yes |
| `ANcpLua.Agents` | manual `git tag vX.Y.Z && git push --tags` | yes |
| `ANcpLua.Analyzers` | manual `git tag vX.Y.Z && git push --tags` | no — tag is the marker |

**Cross-repo bootstrap order** when bumping a package version that flows
through the chain (e.g. `ANcpLua.Roslyn.Utilities` → `ANcpLua.NET.Sdk` →
consumers): tag + publish the upstream repo *first*, wait for NuGet to
index (~4–8 minutes), then bump Truth (`Version.props` in NET.Sdk). A
version pointing at a not-yet-indexed package fails restore with `NU1102`
across every consumer including the SDK's own pack tests.

**Self-reference rule:** a repo's local `Version.props` entry for its *own*
package (e.g. `$(ANcpLuaAnalyzersVersion)` in `ANcpLua.Analyzers/Version.props`)
must point at the **last-published** version, not the one about to ship. CI
stamps the new version at pack time via `-p:Version=X.Y.Z`.

### Dependency graph

```
ANcpLua.NET.Sdk
  ├── injects ANcpLua.Analyzers (compile-time, every consumer project)
  └── ships Version.props (version truth for all consumers)

ANcpLua.Analyzers
  └── consumes ANcpLua.Roslyn.Utilities.Sources (source-only, internal)

ANcpLua.Roslyn.Utilities, ANcpLua.Agents
  └── standalone (no first-party deps)
```

---

## Operations cookbook: adding a new framework repo

1. Copy these files from any existing framework repo:
   - `.github/workflows/auto-merge.yml` (the canonical no-App workflow)
   - `.coderabbit.yaml` (must include `request_changes_workflow: false`)
   - `renovate.json` (extends `github>ANcpLua/renovate-config`; add a
     self-bump-block rule for the repo's own packages)
2. Enable the repo setting: `gh api -X PATCH repos/ANcpLua/<repo> -F allow_auto_merge=true`
3. Configure branch protection on `main` matching the table above.
4. Link this README from the new repo's `AGENTS.md` under a `## Framework
   conventions` section so contributors know where the source of truth is.

---

## Renovate preset usage

```jsonc
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["github>ANcpLua/renovate-config"]
}
```

Per-repo self-bump blocks (in the consumer's local `renovate.json`) — keep
Renovate from auto-bumping a package the repo itself publishes:

| Repo | Pattern |
|---|---|
| `ANcpLua.NET.Sdk` | `/^ANcpLua\\.NET\\.Sdk/` |
| `ANcpLua.Roslyn.Utilities` | `/^ANcpLua\\.Roslyn\\.Utilities/` |
| `ANcpLua.Analyzers` | `/^ANcpLua\\.Analyzers/`, `/^Dummy/` |
| `ANcpLua.Agents` | `/^ANcpLua\\.Agents/` |

---

## Why customManagers exist

Renovate handles native NuGet `PackageReference` and CPM `PackageVersion`
literals out of the box (since [v23.67.0][rel], 2020-11-01); the
[2018 issue about MSBuild-property versions][r2266] was closed in favor of
CPM that same week. The framework repos add a symbolic-name layer
(`Version.props`) above CPM and reference variables via `$(VarName)` in
`Directory.Packages.props`. Renovate cannot follow that substitution into a
separate file, so the `customManagers` parse `Version.props` directly. If a
consumer drops the indirection and inlines literal versions in CPM, every
custom manager here becomes redundant and Renovate's native NuGet manager
takes over.

[rel]: https://github.com/renovatebot/renovate/releases/tag/23.67.0
[r2266]: https://github.com/renovatebot/renovate/issues/2266

## Microsoft Agent Framework matrix (2026-05-05)

Authoritative local data:
[`data/microsoft-agent-framework-packages.json`](data/microsoft-agent-framework-packages.json).
The active NuGet.org profile count is 31 packages: 6 stable, 6 RC (4 active,
2 superseded), 18 preview (17 active, 1 superseded), and 1 alpha.

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

Source or alternate-feed observations are recorded as tripwires, not as
active NuGet.org allowlist entries:

| Package | Status |
|---|---|
| `Microsoft.Agents.AI.Hyperlight` | Source-observed for Hyperlight CodeAct integration; not in the MicrosoftAgentFramework NuGet.org profile |
| `Microsoft.Agents.AI.Mem0` | Source-observed in `dotnet-1.4.0`; the project has `IsPackable=false`. A live NuGet.org flat-container lookup also returned an older `1.0.0-preview.251028.1`, so this stays out of the active allowlist until package ownership/profile status is verified |
| `Microsoft.Agents.AI.Workflows.Declarative.Mcp` | Source/GitHub-Packages observed; NuGet.org flat-container lookup returned 404. Do not treat it as a NuGet.org allowlist package unless publication is verified |
| `Microsoft.Agents.AI.Hosting.AzureAIResponses` | GitHub-Packages observed alpha; not in the MicrosoftAgentFramework NuGet.org profile |

**`replacementName` does not apply to `customManagers` (`customType: "regex"`)** —
for `Version.props` indirection, the replacement PR opens but the property
rename is manual. Each replacement-rule's `prBodyNotes` says so.

## Other automerge rules

| Dimension | Behavior |
|---|---|
| Patch bumps (any ecosystem) | Automerge on green CI |
| npm devDependencies, minor | Automerge on green CI |
| Lockfile maintenance + digest pins | Automerge always |
| Major bumps (default) | Manual review |
| `.NET SDK` (`global.json`) | Stable channel only (`x.y.z`) |
| `platformAutomerge: true` | Default; requires GitHub branch protection with required status checks before merging |
| `prHourlyLimit: 2` / `prConcurrentLimit: 5` | Caps Renovate PR rate per repo |

Rule order matters: the global "majors → manual review" rule sits **before**
the MAF stable + RC allowlists, so the allowlists override it.

## Default-deny unstable

Two early `packageRules` reject prereleases by default:

- **npm**: `allowedVersions: !/(?:alpha|beta|rc|preview|pre|dev|canary|next|nightly)/i`
- **NuGet**: `allowedVersions: !/(?:alpha|beta|preview|pre|dev|experimental|nightly)/i`
  (note: `rc` is **allowed** — the MAF RC track and other Microsoft RC packages
  still flow through)

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

- **Disable MAF major automerge only** — drop the stable + RC allowlist
  rules; the global "majors → manual review" rule handles MAF again.
- **Quarantine all MAF** — delete the stable + RC rules; everything in the
  matrix becomes manual review.
- **Drop the indirection** — remove `customManagers`; CPM literals fall back
  to Renovate's native NuGet manager.

## Deprecated: App-based reusable auto-merge workflow

[`auto-merge-reusable.yml`](.github/workflows/auto-merge-reusable.yml) is
**deprecated**. It was the framework's auto-merge mechanism until 2026-05-13;
all four framework repos now use the inline GITHUB_TOKEN workflow described
under [Auto-merge](#auto-merge-the-2026-pattern-native-no-github-app) above.

The file remains in the repo to avoid breaking any external consumer that
might still reference it, but no first-party consumer should add a `uses:`
to it. Future cleanup task: delete the file once external usage is confirmed
to be zero.
