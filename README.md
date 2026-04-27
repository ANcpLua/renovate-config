# ANcpLua/renovate-config — deployment notes

Draft of a shared Renovate preset for the ANcpLua framework. Replaces the four
hand-rolled `renovate.json` files in `ANcpLua.NET.Sdk`, `ANcpLua.Roslyn.Utilities`,
`ANcpLua.Analyzers`, and `ANcpLua.Agents`.

## Why

- Today: 4× copy-paste configs, drift between them is real (already observed: different
  groupName conventions, missing customManagers, `fileMatch` is the deprecated field name
  per Renovate docs — current is `managerFilePatterns`).
- Goal: one source of truth, repo-local file becomes ~10 lines.

## What this preset does that the current configs don't

1. **`config:best-practices`** baseline (digest pinning, ConfigMigration, abandoned-pkg
   handling, pinned dev deps, security alerts) — currently each repo only uses
   `config:recommended`.
2. **`customManagers` (~50 entries)** for `Version.props` properties so Renovate can
   bump the indirected versions. This is the workaround for Renovate issue #2266
   (open since 2018, priority-4-low — not coming natively).
3. **Unified package groupings** — Roslyn / MS.Extensions / MAF / Meziantou / Testing /
   OpenAPI / OTel are grouped once, used by all four repos.
4. **MAF pre-release manual review** — preview/rc/alpha/beta tracks require manual
   approval (matches current `Agents` repo behavior, missing in others).

## Deployment

### Step 1 — create the shared preset repo

```bash
gh repo create ANcpLua/renovate-config --public --description "Shared Renovate config for the ANcpLua framework"
git -C /tmp clone https://github.com/ANcpLua/renovate-config
cp /Users/ancplua/framework/renovate-config-draft/default.json /tmp/renovate-config/
git -C /tmp/renovate-config add default.json
git -C /tmp/renovate-config commit -m "feat: initial shared preset"
git -C /tmp/renovate-config push
```

### Step 2 — replace each repo's renovate.json

Each of the four framework repos shrinks to:

```jsonc
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["github>ANcpLua/renovate-config"],
  "packageRules": [
    {
      "description": "Block self-bumps (repo-specific)",
      "matchPackageNames": ["/^ANcpLua\\.<RepoName>/"],
      "enabled": false
    }
  ]
}
```

Per-repo `<RepoName>` substitutions:

| Repo | Self-bump block pattern |
|---|---|
| `ANcpLua.NET.Sdk` | `/^ANcpLua\\.NET\\.Sdk/` |
| `ANcpLua.Roslyn.Utilities` | `/^ANcpLua\\./` (Utilities is the foundation — block all first-party self-bumps) |
| `ANcpLua.Analyzers` | `/^ANcpLua\\.Analyzers/`, `/^Dummy/` |
| `ANcpLua.Agents` | `/^ANcpLua\\.Agents/` |

### Step 3 — verify

After the first Renovate cycle, the dependency dashboard should show the new
customManager-detected dependencies (Roslyn, BCL, MS.Extensions, MAF, etc.) as
distinct entries that can be bumped independently. Currently they're invisible
to Renovate because of the `Version="$(SomeProperty)"` indirection.

## Notes / caveats

- **`AspNetCoreVersion`** maps to `Microsoft.AspNetCore.App.Runtime.linux-x64` — that
  package tracks the ASP.NET Core runtime patch cadence. If you'd rather track
  `Microsoft.AspNetCore.OpenApi` or another umbrella, swap the `depNameTemplate`.
- **`MicrosoftExtensionsVersion`** maps to `Microsoft.Extensions.Hosting`. The Extensions
  family ships in lock-step, so any package in the family will work as the canary.
- **`OpenTelemetryVersion`** maps to bare `OpenTelemetry`. The OTel family also ships
  in lock-step but instrumentation packages can lag — verify with each release.
- **Some Property names are guesses** — verify by checking nuget.org or running
  `nuget search <PackageName>` before merging the first PR.
- **`ANcpSdkPackageVersion=999.9.9`** is intentionally NOT in customManagers (it's a
  build-time placeholder, not a real dependency).
- **Aliases** (`XunitMtpVersion`, `MvcTestingVersion`) reference other properties via
  `$(...)` — not in customManagers; bumping the source property cascades.
- **`fileMatch` → `managerFilePatterns`**: the current configs don't use either field
  yet (no customManagers), so the deprecation isn't biting today. The new preset uses
  the current field name `managerFilePatterns` per the Renovate docs.

## Rollback

If the customManagers cause a noisy week (too many PRs at once), drop the
`customManagers` array — the preset still works as a regular grouped/automerged
baseline. Or extend `customManagers` selectively instead of the all-at-once
shape.
