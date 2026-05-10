# Automation Changelog

This file is for cron automated runners. It is not developer-facing release notes.

Keep only the 10 most recent automation entries, newest first. Each entry must
use the schema below so automated runners can parse, sort, validate, and trim
the log deterministically.

```yaml
- timestamp: "2026-05-10T11:35:00Z"
  title: "branch-hygiene-sweep"
  summary: "Fixed ErrorOrX Renovate PR, cleaned SDK duplicate branch state, and refreshed open PR evidence."
  evidence:
    - "quick gate returned NO_WORK=0"
    - "ErrorOrX PR #113 merged at 35e74981218e0a64831ba3e66ee844ade5819420"
    - "ErrorOrX head fix was 540cf30a90082a0aac03986035fe12cf60fe52b7"
    - "ANcpLua.NET.Sdk PR #136 closed without merge at c5a5de66d0ce38f6dec0cda2e6eddb265fb989c1"
    - "ANcpLua.NET.Sdk PR #138 is open at c5a5de66d0ce38f6dec0cda2e6eddb265fb989c1"
    - "renovate-config PR #17 is open at 14940fb9d11db0be60ad0572426aa2b1d6b82ce2 with CodeRabbit and GitGuardian passing"
  actions:
    - "removed ErrorOrX .globalconfig duplicate AL0017 override on renovate/ancplua-sdk"
    - "verified ErrorOrX with dotnet build for ErrorOrX and ErrorOrX.Generators plus both dotnet pack commands"
    - "pushed ErrorOrX renovate/ancplua-sdk and fast-forwarded local main after PR #113 merged"
    - "deleted local ANcpLua.NET.Sdk duplicate branch automation/refix-codestyle-policy-pass-2026-05-10 after matching patch-id against PR #138"
    - "rewrote renovate-config CHANGELOG.md into a parseable YAML entry schema and pushed PR #17"
  blocked:
    - "ANcpLua.NET.Sdk PR #138 test matrix is still running"
    - "ANcpLua.NET.Sdk codex/refix-codestyle-policy-pass worktree has uncommitted local changes"
    - "qyl remains dirty on dev/forgejo-summary-research"
    - "ancplua-claude-plugins still has branch/PR work"
- timestamp: "2026-05-10T08:28:50Z"
  title: "branch-hygiene-sweep"
  summary: "Full hygiene path entered after quick gate found live work."
  evidence:
    - "quick gate returned NO_WORK=0"
    - "ANcpLua.NET.Sdk PR #134 merged at 5159e0f29cffc78dc6f3b23bd433379518f2c481"
    - "ANcpLua.NET.Sdk main at 012f36c92ab38ec285644fb4b1d6c254324b6364"
    - "ErrorOrX PR #113 head at 888c6b34d22f7023ae8a86e8d5a648e6888c5a74"
  actions:
    - "fast-forward checked clean default branches for ANcpLua.Analyzers, ANcpLua.Agents, renovate-config, and ErrorOrX"
    - "switched ANcpLua.NET.Sdk to main and fast-forward checked it"
    - "deleted local ANcpLua.NET.Sdk branch recover/configfilesgenerator-msbuild-property-resolution"
  blocked:
    - "qyl dirty local state on dev/forgejo-summary-research whose upstream is gone"
    - "ANcpLua.NET.Sdk origin/fix/refix-codestyle-policy-pass has commits not in main"
    - "ancplua-claude-plugins PRs #241/#242/#243 remain blocked"
    - "ErrorOrX PR #113 blocked by failed claude-review and running AOT check"
```
