# ANcpLua/renovate-config

Shared Renovate preset for the ANcpLua framework: `ANcpLua.NET.Sdk`,
`ANcpLua.Roslyn.Utilities`, `ANcpLua.Analyzers`, `ANcpLua.Agents`.

## Why

Replaces 4× hand-rolled `renovate.json` files (which had drifted: different
groupName conventions, missing customManagers, deprecated `fileMatch` field).
Adds `customManagers` so Renovate can bump the `Version.props` indirection —
the workaround for [Renovate issue #2266][r2266], open since 2018.

[r2266]: https://github.com/renovatebot/renovate/issues/2266

## Usage

```jsonc
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["github>ANcpLua/renovate-config"],
  "packageRules": [
    {
      "description": "Block self-bumps",
      "matchPackageNames": ["/^ANcpLua\\.<RepoName>/"],
      "enabled": false
    }
  ]
}
```

Per-repo self-bump pattern:

| Repo | Pattern |
|---|---|
| `ANcpLua.NET.Sdk` | `/^ANcpLua\\.NET\\.Sdk/` |
| `ANcpLua.Roslyn.Utilities` | `/^ANcpLua\\./` (foundation — block all first-party) |
| `ANcpLua.Analyzers` | `/^ANcpLua\\.Analyzers/`, `/^Dummy/` |
| `ANcpLua.Agents` | `/^ANcpLua\\.Agents/` |

## Caveats

- **Heterogeneous families**: `OpenTelemetryVersion` uses `OpenTelemetry.Api` as
  canary, but instrumentation packages (`OpenTelemetry.Instrumentation.*`) can
  lag the umbrella by a release. Same for `MicrosoftExtensionsVersion` (canary:
  `Microsoft.Extensions.Diagnostics.Testing`) — the broader Extensions family
  ships in lock-step but consumer-facing surface varies.
- **`AspNetCoreVersion`** uses `Microsoft.AspNetCore.Mvc.Testing` as canary
  (matches what consumers actually reference). The runtime patch cadence flows
  through this package; if a deeper ASP.NET package needs an independent track,
  add a property + customManager.
- **`ANcpSdkPackageVersion=999.9.9`** is intentionally NOT in customManagers —
  it's a build-time placeholder, not a real dependency.
- **MAF pre-release** (`-preview`/`-rc`/`-alpha`/`-beta`) requires manual review
  — automerge is disabled for those.

## Future consideration

The `Version.props` indirection sits above CPM (`Directory.Packages.props`),
which Renovate already bumps natively. ~80% of the customManagers in this
preset would be redundant if the indirection were removed and CPM's
`<PackageVersion Version="x.y.z"/>` literals became the source of truth.
Keeping the indirection has its own benefits (cross-cutting bumps in one place,
version-by-symbolic-name across the ecosystem). The trade-off is worth
revisiting once the customManager guess-and-verify cycle settles.

## Rollback

If `customManagers` produce too many concurrent PRs after a quiet week, drop
that array from this preset — the grouping/automerge baseline still works
without it.
