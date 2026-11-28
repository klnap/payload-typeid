# Changelog

## 0.3.5

### Patch Changes

- 0e0935d: Release workflow only: retry the pack artifact download once after a short wait, matching npm-package-template. No runtime change.
- 43af988: Release workflow only: wait up to three minutes for npm to serve the published version before verifying it. No runtime change.

## 0.3.4

### Patch Changes

- 10653c5: Test infrastructure only: `bun run test:postgres` provisions a disposable PostgreSQL container when no database URL is set, and fails with a diagnostic instead of running without a database. No runtime change.

## 0.3.3

### Patch Changes

- ed6b68c: Fix PostgreSQL guard installation: objects are qualified with the adapter schemaName (a same-named table in public is no longer modified), DDL runs only for missing or differing objects so a runtime role without owner rights can start, and the database guards are checked against an explicit schema test suite.

## 0.3.2

### Patch Changes

- da89ab8: Revise the README: lead with a realistic quick example, state precedence and Globals behavior precisely, separate database guarantees, and document startup requirements and existing-database migration.

## 0.3.1

### Patch Changes

- 218a64b: Document and test that relationship and version rows reference managed TypeIDs through foreign keys, and state what the database guards cannot stop.

## 0.3.0

### Minor Changes

- fde3889: On PostgreSQL, install database guards for managed tables: generate a TypeID for raw SQL inserts without an ID, reject IDs with the wrong prefix or shape, and reject changes to an existing ID. Guards run on every Payload start and do not apply to other adapters.
- ee07f97: Manage every collection by default. Registering `typeId()` gives each collection a TypeID prefix derived from its slug using Payload's singularization. Set `custom.typeId` to a string to override, or to `false` to opt out. Central `typeId({ collections })` entries apply when a collection omits `custom.typeId`.

  Breaking: this replaces the explicit opt-in from 0.2.0. Registering the plugin changes the ID type of every collection that does not opt out. Migrate existing data or set `custom.typeId: false` on those collections before upgrading.

## 0.2.0

### Minor Changes

- 0407e99: Make TypeID management explicit opt-in. `typeId()` no longer changes every collection; a collection is managed only when `custom.typeId` or `typeId({ collections })` enables it.

  Breaking changes:
  - Rename the model-level key from `custom.typeid` to `custom.typeId`. The obsolete key now throws a configuration error.
  - Accept `true`, a prefix string, `false`, or omission. `true` derives a singular prefix from the collection slug (`articles` to `article`, `article-authors` to `article_author`). A string uses the exact prefix. `false` or omission leaves the native ID strategy unchanged.
  - Model-level settings override central settings, including `true` and `false`.
  - Reject `true` and prefix strings on Globals. Globals accept `false` or omission only.
  - Reject slugs whose derived prefix is ambiguous, such as `APIKeys` or `users-2fa`, and recommend an explicit prefix.

  Existing collections that relied on the previous default are no longer managed. Enabling TypeIDs on a collection with existing records changes its ID and relationship column types; migrate data before enabling it.

### Patch Changes

- 4648121: Shorten the README to the essentials: installation, quick start, configuration, utilities, limits, and compatibility.

## 0.1.1

### Patch Changes

- 338805d: Support model-level `custom.typeid` prefixes and exclusions, with precedence over central options. Expand the Payload 3.x peer range to include Payload 3.1.1 and later.

All notable changes to this package are recorded here. Changesets generates release entries.
