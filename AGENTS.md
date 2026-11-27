# Agent development and release policy

This file is authoritative for agent behavior. `CONTRIBUTING.md` and `README.md` describe the same
workflow for contributors and package maintainers.

## Authorization and task scope

For a finished implementation task, agents are authorized to implement, test, commit, push, create or
update pull requests, approve eligible workflow runs, merge verified pull requests, and complete the
resulting npm release. Do not stop at an intermediate stage unless the task is unfinished or blocked.

Follow explicit task limits first. A request such as “no commit,” “no push,” “no merge,” or “no
release” overrides this standing authorization. Research-only and unfinished tasks never publish.
Never publish this private template or change a package's npm Trusted Publisher binding without
separate authorization.

## Development and integration

1. Read this file, inspect `git status`, and preserve all existing user changes.
2. Reuse the active task branch and pull request when they exist. Otherwise fetch `main` and create a
   short-lived `feat/`, `fix/`, `refactor/`, `chore/`, or `docs/` branch from its latest commit.
3. Implement the complete authorized task. Add a Changeset for changes to consumer-visible behavior
   or distributed files. Documentation-only, test-only, and infrastructure-only changes need none.
4. Run the repository's relevant checks, review the complete diff, and use focused tests for new
   release logic. Commit focused Conventional Commits; push the task branch and create or update its
   pull request against `main`.
5. Wait for every required check. Approve eligible workflow runs using the documented maintainer
   procedure. Never bypass branch protections, required reviews, or failed checks.
6. Squash-merge only a verified pull request. GitHub deletes merged remote branches automatically.
   Delete a local task branch only after integration and only when it has no uncommitted work.

Use GitHub Flow: `main` stays releasable, and all changes reach it through short-lived pull requests.
Do not create `develop`, `staging`, or manually managed release branches.

For consumer-facing package documentation, load the shared `package-documentation` skill before
writing or reviewing README files, API docs, examples, migration guides, or release documentation.
Its canonical source and installation recovery steps are in [README.md](README.md#shared-documentation-skill).

## Changesets and publication

Changesets is the only version and changelog authority. Review every pending Changeset before a
release. Use patch for compatible changes, minor for breaking changes before `1.0.0`, and major for
breaking changes from `1.0.0` onward. Do not create artificial package releases for repository-only
changes.

After a feature pull request merges, continue through the Changesets Release PR:

1. Wait for the release workflow to create or update the PR.
2. Inspect its package versions, changelog, and Changesets plan. Wait for required CI checks.
3. Approve held workflow runs with authorized maintainer access, then squash-merge the verified PR.
4. Wait for the release workflow's `outcome` job. Continue through publication and independent
   verification; do not treat green CI or a merged Release PR as proof of publication.
5. Confirm the npm version, expected `latest` dist-tag, provenance, `vX.Y.Z` tag, GitHub Release, and
   changelog entry. Then synchronize local `main` with `git pull --ff-only`.

The release workflow reports `no-release`, `versioned`, or `published`. `versioned` means a
Changesets Release PR is ready; it does not mean the package was published. `no-release` means no
package publication occurred. Only `published`, after the independent verification job passes,
counts as a completed release.

Report these completion states precisely:

- **Implemented:** changes and required local checks are complete.
- **Pushed:** the task branch is on GitHub; its pull request may still be open.
- **Merged:** the verified feature pull request is on `main`.
- **Release-ready:** the Changesets Release PR has valid versions and changelog entries, and all
  required checks pass.
- **Published:** the expected npm version and dist-tag, provenance, Git tag, GitHub Release, and
  changelog entry are independently verified.

If a release fails after npm publication, verify the registry version and provenance before retrying.
Use the original release source commit when repairing a missing tag or GitHub Release. Never move an
existing tag or publish a duplicate version. See [README.md](README.md#retry-after-a-partial-release).

## Workflow approvals and platform limits

GitHub may hold `pull_request` workflow runs created or updated by `GITHUB_TOKEN`. This run approval
is separate from PR review. Use `gh run list` and `gh run view` to identify the run, then open the
Changesets PR with `gh pr view PR --web` and use GitHub's **Approve and run workflows** control.
Watch the run with `gh run watch RUN_ID`. The GitHub CLI has no same-repository run-approval command;
the documented REST approval endpoint is for fork pull requests. Do not use it for this workflow.

The repository's Actions settings allow workflow-created PRs and require SHA-pinned actions. npm
Trusted Publishing is limited to the `main` deployment branch. The private template's branch-ruleset
API currently returns HTTP 403 because its GitHub plan does not enable rulesets for private
repositories. Do not claim `main` is protected until an administrator upgrades the plan and verifies
the rulesets. CodeQL and Dependency Review run on public package repositories and skip this private
template. Private code scanning and dependency review require an eligible GitHub Code Security plan;
enable them only after that plan is active. Never make this template public to work around these
limitations.

## Release-ready validation

Before merging a pull request, run the existing quality gates, verify the Changesets plan, validate
workflow syntax and security, and inspect `git diff --check`. For release-workflow changes, test
`version`, `publish`, `none`, failure, and retry outcomes without publishing a real package.

For changes to release infrastructure, run the online `zizmor` check and obtain a focused independent
review. Do not modify other package repositories as part of template work.
