# sdlc-ship-changes

An MCP server that exposes the ship-changes SDLC pipeline as a curated set of
tools, instead of enforcing it via hooks that gate raw `Bash`/`Edit` calls —
if a pipeline step isn't exposed as a tool, the model has no way to bypass it.

## Status

Proof of concept. Currently exposes exactly one tool, `ship_report`, which
proves the install → build → register → call path end to end. The remaining
pipeline tools (see Roadmap) are stubbed but not implemented.

## Install (from source)

```bash
git clone <this-repo-url>
cd sdlc-tools/packages/sdlc-ship-changes
npm install
npm run build
```

This produces `dist/server.js`, an executable Node script.

## Register with Claude Code

```bash
claude mcp add sdlc-ship-changes -- node /absolute/path/to/dist/server.js
```

Use the absolute path to `dist/server.js` on your machine.

## Verify

Inside a Claude Code session, run `/mcp` and confirm `sdlc-ship-changes` is
listed as connected with one tool, `ship_report`.

Then try a prompt like:

> Call ship_report for PROJ-123, status Resolved, branch
> `feature/proj-123-fix`, commit `abc1234`, verdict pass, MR
> https://gitlab.example.com/group/repo/-/merge_requests/42 with iid 42,
> files touched `src/a.ts` and `src/b.ts`, no blockers.

Claude should call `ship_report` and return a formatted report — it should
not hand-write the report text itself.

## Roadmap

Remaining pipeline tools, to be implemented in later slices:

- `read_changes` — inspect the working tree diff
- `create_jira_task` — create the Jira issue for the change
- `transition_issue` — move the Jira issue through its workflow
- `create_branch` — create the git branch for the change
- `commit` — commit staged changes
- `open_mr` — open the merge/pull request
- `poll_ci` — poll CI status for the MR

Persistence for `audit-log` and `session-store` (currently in-memory) is
expected to land alongside `read_changes`, the next tool after this slice.
