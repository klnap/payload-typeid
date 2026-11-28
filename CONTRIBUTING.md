# Contributing

Use short-lived branches and open a pull request against `main`. The repository uses squash merges.

Use Conventional Commits for pull request titles, such as `fix: handle empty input` or
`feat!: change the public API`. Keep commits understandable; local Git hooks are not required.

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

## PostgreSQL tests

`bun run test:postgres` runs the PostgreSQL integration and schema tests for the `default` ID type. For the `uuid`
ID type, set `PAYLOAD_TYPEID_TEST_ID_TYPE=uuid`. Without `PAYLOAD_TYPEID_TEST_DATABASE_URL`, the command starts
`postgres:16-alpine`, pinned to the same digest as CI, in a container with a random loopback port and password,
then removes it when the command ends. The tests create their own databases and schemas on that server. Docker
must be running for this command; `bun test` does not need it. If Docker is unavailable, the command exits 1
with a message instead of skipping the tests. CI sets the URL to its own service container.
