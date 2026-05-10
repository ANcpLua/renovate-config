# Automation Changelog

This file is for cron automated runners. It is not developer-facing release notes.

Keep only the 10 most recent automation entries, newest first.

## 2026-05-10T08:28:50Z - branch-hygiene-sweep

branch-three
Changed: ran quick gate and entered full hygiene because live work exists; fast-forward checked clean default branches for ANcpLua.Analyzers, ANcpLua.Agents, renovate-config, and ErrorOrX; switched ANcpLua.NET.Sdk to main, fast-forward checked it, and deleted local stale branch `recover/configfilesgenerator-msbuild-property-resolution`.
Evidence: quick gate returned `NO_WORK=0`; ANcpLua.NET.Sdk PR #134 is merged at head `5159e0f29cffc78dc6f3b23bd433379518f2c481`; ANcpLua.NET.Sdk main is `012f36c92ab38ec285644fb4b1d6c254324b6364`; qyl has dirty files `services/qyl.mcp/Tools/SummaryFacade.cs` and `tests/qyl.mcp.tests/Tools/SummaryFacadeTests.cs`; ErrorOrX PR #113 head is `888c6b34d22f7023ae8a86e8d5a648e6888c5a74` with `claude-review` failed and `aot-publish` in progress.
Pushed/Merged/Closed/Deleted: deleted local ANcpLua.NET.Sdk branch `recover/configfilesgenerator-msbuild-property-resolution`; no PRs merged, closed, or remote branches deleted.
Blocked: qyl dirty local state is on `dev/forgejo-summary-research` whose upstream is gone; ANcpLua.NET.Sdk remote `origin/fix/refix-codestyle-policy-pass` has commits not in main; ancplua-claude-plugins PRs #241/#242/#243 remain blocked; ErrorOrX PR #113 is blocked by failed Claude review and running AOT check.
