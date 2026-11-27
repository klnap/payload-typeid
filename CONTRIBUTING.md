# Contributing

Follow [AGENTS.md](AGENTS.md) for the authoritative end-to-end development and release policy.

Start by checking `git status` and preserving existing changes. Reuse an active task branch or pull
request; otherwise fetch `main` and create a short-lived `feat/`, `fix/`, `refactor/`, `chore/`, or
`docs/` branch. Use GitHub Flow and open a pull request against `main`; the repository uses squash
merges.

Use focused Conventional Commits and a matching pull request title, such as `fix: handle empty input`
or `feat!: change the public API`. Do not create `develop`, `staging`, or release branches.

Add a changeset when a change affects a package consumer:

```sh
bun run changeset
```

Choose `patch` for compatible fixes and additions, `minor` for breaking changes while the package is
below `1.0.0`, and `major` for breaking changes from `1.0.0` onward. This pre-1.0 policy is an
explicit project convention; SemVer itself treats pre-1.0 APIs as unstable.

Documentation-only, test-only, and internal maintenance changes do not need a changeset unless they
change distributed files or consumer behavior.

Before opening a pull request, run:

```sh
bun install --frozen-lockfile
bun run check
```

Run `bunx changeset status` to review the pending release plan. Never add a Changeset for
documentation-only, test-only, or infrastructure-only work unless distributed files or consumer
behavior change.

## Complete the lifecycle

For an authorized finished implementation, continue through push, pull request checks, squash merge,
the generated Changesets Release PR, and verified npm publication. Agents have standing authorization
for these steps; explicit task restrictions take precedence.

GitHub may hold CI runs for a Changesets-created PR. Use `gh run list` and `gh run view` to identify
the run, then `gh pr view PR --web` and approve it with GitHub's **Approve and run workflows** control.
Watch completion with `gh run watch RUN_ID`. The CLI has no documented approval command for these
same-repository runs.

To stop at a specific boundary, state it in the task:

- **Local only:** do not commit or push.
- **Push only:** commit and push, but do not create or merge a pull request.
- **Merge only:** merge after required checks, but do not continue to npm publication.
- **No release:** complete the requested integration without publishing a package.

Treat release work as complete only after verifying the expected npm version and `latest` dist-tag,
npm provenance, Git tag, GitHub Release, and changelog. For partial failures, follow the recovery
steps in [README.md](README.md#retry-after-a-partial-release). Never publish this template.
