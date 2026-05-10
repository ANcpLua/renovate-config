# Automation Changelog

This file is for cron automated runners. It is not developer-facing release notes.

Keep only the 10 most recent automation entries, newest first. Each entry must
use the schema below so automated runners can parse, sort, validate, and trim
the log deterministically.

```yaml
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
