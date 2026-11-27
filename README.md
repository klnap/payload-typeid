# npm Package Template

A standalone TypeScript library template for public npm packages. It uses Bun for development,
Node.js-compatible ESM output, Changesets for releases, and npm Trusted Publishing with provenance.
The template itself stays private and has an `npm prepublishOnly` guard. CI/CD uses only GitHub's
short-lived `GITHUB_TOKEN` and npm OIDC; it needs no Actions secrets or custom GitHub App.

## Create a package

Create and clone a public repository with the authenticated GitHub CLI:

```sh
gh auth status
gh repo create OWNER/REPOSITORY \
  --template klnap/npm-package-template \
  --public \
  --clone \
  --description "PACKAGE DESCRIPTION"
cd REPOSITORY
```

GitHub does not copy rulesets, environments, security settings, or npm Trusted Publisher settings.
Apply the repository configuration in [Configure GitHub](#configure-github) before enabling releases.

Then:

1. `package.json`: replace the name, description, keywords, and every `klnap/npm-package-template`
   repository, homepage, and issue URL.
2. `README.md`: replace this guide with package documentation using the structure below.
3. `SECURITY.md` and `.github/ISSUE_TEMPLATE/config.yml`: replace `OWNER/REPOSITORY`.
4. `src/index.ts`, tests, and the example API with the package implementation.
   Update the consumer smoke-test imports and assertions in both workflows to match that API.
5. Replace the copyright holder and year in `LICENSE`.
6. Keep `private: true` through setup and verification. Remove it only when the package identity is
   final and the package is ready for its first publication.

`packageManager` in `package.json` is the single Bun version source. The setup action reads it.
`bunfig.toml` applies Bun's three-day dependency release-age gate. Bun does not run arbitrary
dependency lifecycle scripts by default; add no `trustedDependencies` unless a dependency has a
verified need. After changing the package name, refresh Bun's root lock metadata:

```sh
bun install
```

Commit the regenerated lockfile. Use frozen installs after that.

## Install and develop

Install the pinned Bun version, then install dependencies:

```sh
bun install --frozen-lockfile
```

| Command                  | Purpose                                                                |
| ------------------------ | ---------------------------------------------------------------------- |
| `bun run build`          | Emit Node.js ESM JavaScript, declarations, and source maps to `dist/`. |
| `bun run lint`           | Run Biome lint checks.                                                 |
| `bun run format`         | Check formatting.                                                      |
| `bun run format:write`   | Apply formatting.                                                      |
| `bun run typecheck`      | Type-check source and tests.                                           |
| `bun test`               | Run unit tests in Bun.                                                 |
| `bun run verify:package` | Run publint and Are the Types Wrong?                                   |
| `bun run check`          | Run all local quality checks.                                          |
| `bun run changeset`      | Describe a consumer-visible change for the next release.               |

The package tarball is the product. CI inspects it, installs it in a temporary project outside the
repository, compiles public imports, and tests Node.js 22.14.0, the current Node.js 22, 24, and 26.

## Changesets and version policy

Add a changeset for consumer-visible changes. Skip it for documentation-only, test-only, or internal
maintenance changes unless distributed files or behavior change.

Use patch for compatible fixes and additions. Before `1.0.0`, use minor for breaking changes; from
`1.0.0` onward, use major. This project convention intentionally differs from strict SemVer advice
for unstable `0.x` APIs. Changesets applies the chosen bump without inferring it from commit text.

## Release lifecycle

```text
Pull request and CI
→ squash merge to main
→ automated Changesets Release PR
→ release PR CI
→ maintainer merges Release PR
→ build, pack, and verify the tarball
→ npm Trusted Publishing
→ vX.Y.Z tag and GitHub Release
```

The version job creates or updates the Release PR with its job-scoped `GITHUB_TOKEN`. It requires
`contents: write`, `pull-requests: write`, and GitHub's **Allow GitHub Actions to create and approve
pull requests** setting. GitHub [starts `pull_request` workflows for token-created PRs but holds them
for approval](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request).
A maintainer with write access must approve the runs before merging. This workflow-run approval is
separate from a PR review; it does not bypass required checks or branch rules.

GitHub suppresses most events caused by `GITHUB_TOKEN`. The documented `pull_request` exception
covers `opened`, `synchronize`, and `reopened`; each run needs maintainer approval. Versioning also
runs the package checks before it opens or updates the PR. The Release PR title uses
`chore(release): version packages`, which passes the Conventional Commit check.

The release workflow uses Changesets' `select-mode`, `version`, `pack`, and `publish` actions.
`select-mode` chooses `version`, `publish`, or `none`. The `version` job opens or updates the
Changesets Release PR. The `publish` path packs once, verifies that exact tarball and its SHA-256
publish-plan integrity in a read-only job, then publishes the packed artifact without rebuilding it.
Only the publish job receives `id-token: write`. After npm reports a new publication, Changesets
pushes the `vX.Y.Z` tag; the workflow verifies its source commit and creates the GitHub Release.

The `outcome` job distinguishes `no-release`, `versioned`, and `published`. A skipped or failed
publication cannot be reported as published. The separate verification job checks the npm version,
`latest` dist-tag, provenance, Git tag, GitHub Release, and changelog. Only its success completes a
release.

Report `implemented` for checked work in the local tree, `pushed` for a remote task branch,
`merged` for a feature PR on `main`, and `release-ready` for a verified Changesets Release PR.
Reserve `published` for a release whose npm version, dist-tag, provenance, Git tag, GitHub Release,
and changelog are independently verified.

Release runs serialize without canceling active publications. GitHub keeps one pending run per
concurrency group and replaces an older pending run with a newer one. The newest `main` commit
contains the full history, so a manual rerun on `main` can process any remaining Changesets.

### Retry after a partial release

- Pack or consumer-verification failure before publication: fix the cause, then rerun on `main`.
- OIDC failure before publication: correct the npm publisher/environment binding, then rerun.
- npm version already exists: Changesets detects published versions and does not overwrite them.
- Post-publication verification fails: do not blindly rerun or treat `no-release` as recovery.
  Inspect npm's version, integrity, provenance, and dist-tag, plus the Git tag, GitHub Release, and
  changelog. The workflow may report no new publication on retry even when metadata is incomplete.
- npm succeeds but tag or release creation fails: verify the npm version and provenance first. Get
  `SOURCE_SHA` from that release run's pack job log. Confirm that commit contains the published
  package name and version. If the tag is missing, create it against that exact commit:

  ```sh
  SOURCE_SHA=<source-commit-from-release-run>
  git tag -a vX.Y.Z "$SOURCE_SHA" -m "vX.Y.Z"
  git push origin vX.Y.Z
  ```

  If the tag already exists, verify `git rev-parse 'vX.Y.Z^{commit}'` matches `SOURCE_SHA`. If it
  does not match, stop and investigate; do not move the tag or create a GitHub Release against it.
  Create the GitHub Release only after confirming the tag matches and the release is missing:

  ```sh
  gh release create vX.Y.Z --verify-tag --generate-notes
  ```

- A newer commit reaches `main`: the active run stays on its original source commit. The newest
  non-canceled pending run processes the newer `main` state.

Check `npm view PACKAGE@VERSION dist.integrity` and the package's provenance before treating a
publication as complete. Also confirm `npm view PACKAGE dist-tags --json` points `latest` to the
expected version, the `vX.Y.Z` Git tag points to the release source commit, the GitHub Release exists,
and `CHANGELOG.md` contains that version. Do not publish a new version for repository-only changes.

## Configure GitHub

Run these commands with an authenticated `gh` CLI and repository-admin access. Template creation
does not copy these settings. They use native GitHub APIs; they create no credentials.

```sh
REPO=OWNER/REPOSITORY

gh repo edit "$REPO" \
  --default-branch main \
  --description "PACKAGE DESCRIPTION" \
  --homepage "https://github.com/$REPO#readme" \
  --delete-branch-on-merge \
  --enable-squash-merge \
  --enable-merge-commit=false \
  --enable-rebase-merge=false

# Keep the default token read-only; enable the setting required for Actions-created PRs.
gh api --method PUT "repos/$REPO/actions/permissions/workflow" \
  -f default_workflow_permissions=read \
  -F can_approve_pull_request_reviews=true

# Require pinned actions; this template already pins every action to a full commit SHA.
gh api --method PUT "repos/$REPO/actions/permissions" --input - <<'JSON'
{"enabled":true,"allowed_actions":"all","sha_pinning_required":true}
JSON

# Restrict npm OIDC deployments to main. Do not add environment reviewers.
gh api --method PUT "repos/$REPO/environments/npm" --input - <<'JSON'
{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
JSON
gh api --method POST "repos/$REPO/environments/npm/deployment-branch-policies" \
  -f name=main -f type=branch

# Enable secret scanning and push protection.
gh api --method PATCH "repos/$REPO" --input - <<'JSON'
{"security_and_analysis":{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"}}}
JSON

# Enable the dependency graph and Dependabot vulnerability alerts.
gh api --method PUT "repos/$REPO/vulnerability-alerts"
gh api --method PUT "repos/$REPO/private-vulnerability-reporting"
gh api --method PUT "repos/$REPO/immutable-releases"
```

Before creating rulesets, inspect existing rules with `gh api "repos/$REPO/rulesets"`. Update matching
rulesets by ID instead of creating duplicates. For a new repository, create the required rules:

```sh
gh api --method POST "repos/$REPO/rulesets" --input - <<'JSON'
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "conditions": {"ref_name": {"include": ["refs/heads/main"], "exclude": []}},
  "rules": [
    {"type": "pull_request", "parameters": {"allowed_merge_methods": ["squash"], "required_approving_review_count": 0, "dismiss_stale_reviews_on_push": false, "require_code_owner_review": false, "require_last_push_approval": false, "required_review_thread_resolution": true}},
    {"type": "required_status_checks", "parameters": {"do_not_enforce_on_create": false, "required_status_checks": [{"context": "verify"}], "strict_required_status_checks_policy": true}},
    {"type": "required_linear_history"},
    {"type": "deletion"},
    {"type": "non_fast_forward"}
  ],
  "bypass_actors": []
}
JSON

gh api --method POST "repos/$REPO/rulesets" --input - <<'JSON'
{
  "name": "release-tags",
  "target": "tag",
  "enforcement": "active",
  "conditions": {"ref_name": {"include": ["refs/tags/v*"], "exclude": []}},
  "rules": [{"type": "update"}, {"type": "deletion"}],
  "bypass_actors": []
}
JSON
```

The tag ruleset blocks updates and deletion but allows the release workflow to create version tags.
Do not add an independent-review requirement for a single-maintainer repository; retain the required
`verify` check and resolved conversations. Read settings back after applying them:

```sh
gh repo view "$REPO" --json name,url,defaultBranchRef,deleteBranchOnMerge,squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed
gh api "repos/$REPO/actions/permissions"
gh api "repos/$REPO/actions/permissions/workflow"
gh api "repos/$REPO/rulesets"
gh api "repos/$REPO/immutable-releases"
gh api "repos/$REPO/environments/npm"
gh api "repos/$REPO/vulnerability-alerts"
gh api "repos/$REPO/private-vulnerability-reporting"
```

The Actions setting above allows `GITHUB_TOKEN` to create and approve PRs. The release job is the only
job granted `pull-requests: write`; it does not approve PRs. Workflow runs caused by its PR wait for
a maintainer's approval. Use `gh run list` and `gh run view` to locate a held run, then
`gh pr view PR --web` and GitHub's **Approve and run workflows** control. Watch it with
`gh run watch RUN_ID`. This is distinct from approving the PR itself. GitHub documents this setting
[here](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#allowing-github-actions-to-create-and-approve-pull-requests).
The CLI has no documented approval command for these same-repository runs; GitHub's REST approval
endpoint applies to fork pull requests.
If an organization policy blocks the setting, an organization admin must allow it; repository admins
cannot override that policy.

The repository has an optional CodeQL workflow and a minimal Renovate configuration. Install the
Renovate GitHub App only if automated dependency updates are wanted; that one-time external app
authorization has no repository secret.

GitHub rulesets protect `main` and release tags only when the repository plan supports them. This
template is private, and its current plan returns HTTP 403 for the rulesets API. Upgrade the plan
before claiming `main` is protected; keep the template private.

CodeQL and Dependency Review skip this private template; public package repositories run both checks.
Private repositories require an eligible GitHub Code Security plan. After enabling that plan, remove
the visibility guards from both workflow jobs to run these checks privately.

For an existing package, retain its public API, version history, and source layout. Reconcile
metadata and scripts, then apply the same GitHub settings. Do not replace its package wholesale.

## Configure npm Trusted Publishing

Use the official npm CLI; no web settings page or GitHub publishing token is needed. `npm trust`
requires npm CLI `11.15.0+`, package write access, and account-level 2FA. The package must already
exist on npm. The workflow pins npm `12.2.3` and runs on Node.js 24.

For an unpublished package, first finalize its identity, remove `private: true`, and verify the
package locally. Sign in on the maintainer machine and publish the initial version once:

```sh
npm login
npm publish --access public
```

This first publication requires the package owner's normal npm authorization and 2FA. It is not a
GitHub Actions secret. Do not create a trusted publisher before the package exists.

For an existing package, inspect its current publisher before changing anything. Do not revoke or
replace a mismatched publisher without explicit owner approval:

```sh
npm trust list PACKAGE
npm trust github PACKAGE \
  --file release.yml \
  --repository OWNER/REPOSITORY \
  --environment npm \
  --allow-publish \
  --yes
```

Run `npm trust github` only if no publisher exists. npm currently permits one trusted publisher per
package. The command uses the maintainer's local npm authentication and performs its required 2FA
authorization; `--yes` does not bypass 2FA. A new publisher must complete its first OIDC publish
within two days, so configure it near the first release.

Trusted Publishing binds the exact GitHub owner, repository, `release.yml`, and `npm` environment.
The publish job uses `id-token: write`; npm creates provenance automatically. It uses no
`NPM_TOKEN`, `NODE_AUTH_TOKEN`, npm auth file, or `--provenance` flag. Verify a real package's
provenance after its first OIDC publication. Then enable the package's **Require two-factor
authentication and disallow tokens** publishing-access setting. Trusted Publishing continues to
work, while legacy tokens cannot publish. Never publish this private template.

## Shared documentation skill

The canonical `package-documentation` Agent Skill lives in [`skills/package-documentation/`](skills/package-documentation/).
It defines the evidence, writing, README, and verification standards for standalone `@klnap` packages.
Load it for README creation or redesign, API documentation, usage examples, migration guides,
documentation reviews, and release-related documentation.

The skill is stored once in this repository and installed globally for Claude Code and OpenCode at
`~/.claude/skills/package-documentation`. Both agents discover that location. On a new WSL machine,
clone or update this private repository, then restore only the managed link:

```sh
if [ -d ~/code/packages/npm-package-template/.git ]; then
  git -C ~/code/packages/npm-package-template pull --ff-only
else
  gh repo clone klnap/npm-package-template ~/code/packages/npm-package-template
fi
chezmoi apply ~/.claude/skills/package-documentation
```

If the link is not managed on another machine, create it only when the destination is absent:

```sh
mkdir -p ~/.claude/skills
test ! -e ~/.claude/skills/package-documentation
test ! -L ~/.claude/skills/package-documentation
ln -s ~/code/packages/npm-package-template/skills/package-documentation \
  ~/.claude/skills/package-documentation
```

Confirm the link with `readlink ~/.claude/skills/package-documentation`. Update the repository with
`git -C ~/code/packages/npm-package-template pull --ff-only`; the symlink then exposes the new skill.
Do not copy the skill into individual package repositories.

Use this README information hierarchy, omitting sections without meaningful consumer value:

1. **Identity** — Package name and one-sentence product description; no extra heading.
2. **Quick example** — Minimal, realistic demonstration immediately after the introduction.
3. **Why?** — The real developer problem, motivation, and reason the package exists.
4. **Features** — Key capabilities and consumer benefits.
5. **Installation** — Separate Bun and npm commands.
6. **Usage** — Practical examples from basic integration through advanced use.
7. **Configuration** — Relevant options, defaults, semantics, and constraints.
8. **Compatibility** — Verified runtime, framework, peer dependency, and limitation details.
9. **Documentation** — Relevant concepts, guides, API, security, or migration links.
10. **License** — License information.

This hierarchy is canonical, not a demand for ten headings. Combine related usage sections, omit
empty sections, and scale detail to package complexity. A small library or Payload plugin may keep
its complete documentation in the README; complex packages such as revalidation and next-proxy-chain
should use supporting docs where they improve navigation. Apply progressive disclosure and avoid
duplicated explanations or examples.

Keep badges limited to checks that exist and reflect current status. Do not add npm download or
publication badges before the first release.

## License

MIT. Replace `klnap` with the package's copyright holder and update the year.
