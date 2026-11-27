# `@klnap/payload-typeid` implementation specification

## Evidence baseline

- Package conventions follow the standalone TypeScript package template.
- The Payload peer range is `^3.1.1`; development dependencies remain pinned to the latest stable `3.94.2`. PostgreSQL 16 integration fixtures verify Payload `3.1.1`, `3.68.4`, `3.71.0`, and `3.94.2` with both default serial and explicit UUID adapter IDs.
- Payload `3.1.1` is the earliest inspected release exporting `flattenAllFields`; `3.1.0` and `3.0.0`–`3.0.2` do not. The upstream introduction is [PR #9299](https://github.com/payloadcms/payload/pull/9299), merged on 2024-11-25.
- Payload detects custom IDs from a root-level `id` field before it traverses layout fields. Prepending the plugin-owned field avoids the nested-layout relationship-type defects described in [issue #13695](https://github.com/payloadcms/payload/issues/13695) and [issue #14927](https://github.com/payloadcms/payload/issues/14927).
- [PR #15110](https://github.com/payloadcms/payload/pull/15110) changed MongoDB custom-ID discovery and after-read traversal for nested fields; it did not change this plugin's root-level ID or PostgreSQL schema path. [PR #13010](https://github.com/payloadcms/payload/pull/13010) remains open and concerns a numeric custom ID after named tabs, not the prepended text ID.
- TypeID specification: <https://github.com/jetify-com/typeid/blob/main/spec/README.md> and official vectors at `spec/valid.yml` and `spec/invalid.yml`.
- UUIDv7: <https://www.rfc-editor.org/rfc/rfc9562.html#section-5.7>.
- The codec uses the TypeID specification directly; UUIDv7 generation uses Node.js `crypto.randomBytes`.

## Public API

- `typeId(options?)` is a Payload plugin. It manages every collection present when the plugin runs, except explicit `false` entries in `collections`.
- `CollectionConfig.custom.typeid` accepts a prefix string, `false`, or `undefined`. Model values override `TypeIdOptions.collections`; omitted or `undefined` values inherit the central option, then the normalized slug.
- `TypeIdOptions` exposes only `collections`; each value is a prefix override or `false` to exclude that collection.
- Payload's public `CollectionCustom` and `GlobalCustom` extension points accept `Record<string, any>` in the inspected Payload releases, so consumers can type `custom.typeid` without module augmentation or a new exported config type.
- `generateTypeId(prefix)`, `parseTypeId(value)`, `isTypeId(value, expectedPrefix?)`, `fromUUID(prefix, uuid)`, and `toUUID(value)` implement the TypeID codec locally.
- `TypeID<Prefix>` is a prefix-specific template-literal type. It is a compile-time aid, not runtime proof.
- Payload-generated document types still use `id: string`; they do not infer this package's collection-specific prefix type.

## Identifier contract

- TypeID follows the official format: optional lowercase prefix, optional `_` separator, and 26 lowercase Crockford Base32 characters encoding exactly 128 big-endian bits.
- Prefix grammar is `^([a-z]([a-z_]{0,61}[a-z])?)?$`; maximum length is 63. The plugin requires non-empty prefixes.
- Prefixless values and non-v7 UUID payloads remain valid in general codec utilities. `isTypeId` checks canonical structure and overflow, not UUID version.
- Newly generated identifiers use UUIDv7 timestamps and cryptographically secure random bits.
- UUIDv7 carries a 48-bit Unix-millisecond timestamp and 74 random bits. It is sortable across distinct timestamps, but the package does not guarantee monotonicity within one millisecond or across clock changes/processes.

## Prefix resolution and validation

- Automatic resolution lowercases ASCII, converts hyphens to underscores, and inserts underscores at camel-case and acronym boundaries. It does not singularize, abbreviate, truncate, or remove characters.
- Invalid automatic results, invalid explicit overrides, duplicate managed prefixes, malformed options, unknown overrides, and collection-level `id` conflicts fail during plugin execution with collection-specific remediation.
- Resolve model, central, and default values before prefix validation and collision checks. Structurally invalid central options and unknown collection references remain errors, even when a model override shadows them.
- The implementation uses own-property enumeration and maps for resolved slugs; it does not mutate caller options or configuration objects.
- Payload's public `flattenAllFields` utility finds IDs in flattened row/collapsible/unnamed-tab layouts without treating nested group, array, block, or named-tab IDs as collection IDs. The package requires its public export, establishing the `3.1.1` minimum.

## Collection scope and lifecycle

- Managed scope is every user- or plugin-defined collection in `config.collections` when this plugin runs, including auth and upload collections.
- Payload 3.1.1 applies plugins in array order; 3.94.2 sorts by `Plugin.order`. The plugin uses the highest order supported by the current API, but must still follow collection-producing plugins to work on the oldest supported release.
- Payload collections added after config sanitization, internal adapter tables, version/array/block row identifiers, and globals are not independently managed. Globals are not collection documents.
- Global APIs identify their single document by slug. `GlobalConfig` has no configurable collection-style ID field; `custom.typeid: false` is an accepted no-op, and string prefixes are rejected.
- Each managed collection gets one native hidden text `id` field. Its field hooks generate IDs on create and duplicate, and its access settings disallow client updates. Collection operation hooks reject caller-supplied IDs on create and attempts to update IDs, including trusted override-access calls.
- Existing custom ID fields are preserved by failing configuration rather than replacing their contract. Collections can opt out with `collections[slug] = false`.
- REST, GraphQL, Admin, and Local API use the native Payload ID. No API translation, adapter patch, or additional field is used.

## Storage, compatibility, and existing data

- PostgreSQL 16 is the only adapter represented by the integration suite. Packed-artifact fixtures verify Payload `3.1.1`, `3.68.4`, `3.71.0`, and `3.94.2` with default serial IDs and explicit UUID IDs. Payload maps a custom `id: { type: 'text' }` to a `varchar` primary key, and relationship columns use the referenced collection's native ID type.
- The integration suite inspects primary, relationship, array/block parent, version, and internal-table column types. It also covers create, lookup, update protection, duplication, drafts, localization, uploads, polymorphic relationships, and excluded UUID collections.
- Global PostgreSQL `idType` remains unchanged for excluded collections, Globals, versions, and adapter internals. The adapter defaults to serial/integer IDs; `idType: 'uuid'` retains UUIDs in those scopes.
- Text identifiers consume more index/storage space than native 16-byte UUID values. Prefixes also repeat in relationship values.
- Existing UUID/numeric primary keys are not converted. Consumers must migrate all related primary and foreign keys or adopt the plugin on a clean database.
- Only PostgreSQL 16 is verified, with both adapter ID strategies. Other database adapters remain unverified. Payload `3.94.0` raised its Node.js engine requirement and tightened its Next.js/React peer requirements; those host constraints do not change this plugin's core Payload API boundary. The package recommends the latest stable Payload 3.x for security fixes.

## Errors, security, and performance

- Invalid codec inputs throw `TypeError`; `isTypeId` returns `false`.
- Caller-controlled IDs cannot select, impersonate, or mutate a managed document through Payload operations. Trusted code that writes directly to the database is outside this protection.
- IDs are not credentials. Prefixes reveal entity type; UUIDv7 reveals approximate creation time; unpredictability does not replace authorization or credential-grade tokens.
- Generation and conversion are synchronous, stateless, local operations with no database or network access.
- The codec rejects malformed lengths, alphabet, separators, prefixes, and 130-bit overflow.

## Verification plan

- Official valid and invalid TypeID vectors, round trips, malformed inputs, UUID version/variant/timestamp bits, random UUIDs, and concurrent generation.
- Prefix normalization, override validation, plugin ordering, explicit exclusions, duplicate prefixes, flattened and nested ID fields, immutable IDs, and configuration preservation.
- Real Payload/PostgreSQL integration for both default serial and UUID adapter strategies; model/central precedence; nested arrays/blocks; polymorphic relations; drafts/autosave/publishing; uploads; duplication; Global row IDs; internal tables; and foreign-key type constraints.
- Build and test the generated package artifact in an isolated consumer; test positive and negative TypeScript prefix assignments.
- Stolbek Studio integration must use an isolated database. Never run destructive schema changes against an existing or shared database.

## Non-goals

No custom identifier fields, UUID mapping table, database extension/type, adapter patch, migration framework, API middleware, alternate ID strategy, telemetry, caches, custom Admin UI, or global identifier registry.

## Stolbek integration

- Studio consumes the standalone package through a relative symlink at `stolbek/packages/payload-typeid` pointing to `../../packages/payload-typeid`.
- Register `typeId()` after existing collection-producing plugins. Preserve `postgresAdapter({ idType: 'uuid' })`.
- Current `payload-iam` creates users with its own UUIDv7 and asserts that Payload returns that exact ID. Studio must exclude `users` until that separate package supports host-owned TypeID user IDs; changing IAM is outside this package's scope.
- `projects` uses a native TypeID ID, including its nested arrays and blocks. `users` remains excluded for IAM's UUIDv7 contract.
- The package is currently private and consumed through a local workspace link. Follow `AGENTS.md` for its Git and release lifecycle; publish only through Changesets and GitHub Actions.
