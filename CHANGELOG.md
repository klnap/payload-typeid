# Changelog

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
