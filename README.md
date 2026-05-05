# ANcpLua Renovate Config

Shared Renovate preset for `ANcpLua.NET.Sdk`, `ANcpLua.Roslyn.Utilities`,
`ANcpLua.Analyzers`, `ANcpLua.Agents`.

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

Authoritative data: [`data/microsoft-agent-framework-packages.json`](data/microsoft-agent-framework-packages.json) — 31 packages: 6 stable, 6 rc (4 active, 2 superseded), 18 preview (17 active, 1 superseded), 1 alpha.

| Track | Behavior |
|---|---|
| Stable (6) | `allowedVersions: /^\d+\.\d+\.\d+$/` — automerge incl. majors, stable only |
| RC (4 active) | `allowedVersions: /^\d+\.\d+\.\d+(?:-rc...)?$/i` + `ignoreUnstable:false` — automerge incl. majors, stable + `-rc` only |
| Preview/alpha quarantine (18) | Same allowed-versions regex as RC; `automerge:false` + `dependencyDashboardApproval:true`. Renovate cannot propose new preview/alpha bumps; only graduation PRs to stable/RC open |
| Superseded (3) | `replacementName` rules → `Foundry` family, manual approval |

**`replacementName` does not apply to `customManagers` (`customType: "regex"`)** — for `Version.props` indirection, the replacement PR opens but the property rename is manual. Each replacement-rule's `prBodyNotes` says so.

## Other automerge rules

| Dimension | Behavior |
|---|---|
| Patch bumps (any ecosystem) | Automerge on green CI |
| npm devDependencies, minor | Automerge on green CI |
| Lockfile maintenance + digest pins | Automerge always |
| Major bumps (default) | Manual review |
| `.NET SDK` (`global.json`) | Stable channel only (`x.y.z`) |
| `platformAutomerge: true` | Uses GitHub's native auto-merge (waits for required branch-protection checks) |
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
