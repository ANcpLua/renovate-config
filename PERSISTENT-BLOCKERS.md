# Persistent Blockers

This file tracks long-lived branch-hygiene blockers that recur across automation sweeps.
Individual sweep entries in `CHANGELOG.md` should link here instead of repeating the full
blocker body every run.

## Active

- qyl PR `#313`: pushed-checks-running per no-watch policy.
- qyl `dev/forgejo-summary-research`: dirty worktree with `services/qyl.mcp/Tools/SummaryFacade.cs`
  changes and untracked `tests/qyl.mcp.tests/Tools/SummaryFacadeTests.cs`.
- qyl PR `#307`: Backend (.NET) / post-push check investigation.
- ancplua-claude-plugins PR `#241`: branch-policy/auto-merge state after review cleanup.
