# `@klnap/payload-typeid` implementation specification

## Evidence baseline

- Peer range `^3.1.1`. Development dependencies pin the latest stable Payload `3.94.2`.
- PostgreSQL 16 integration fixtures run against Payload `3.1.1`, `3.68.4`, `3.71.0`, and `3.94.2`, with the default serial and explicit `idType: "uuid"` strategies.
- `flattenAllFields` is exported from the Payload root entry in `3.1.1`. The package's minimum version is set by this export. Payload `3.1.0` and `3.0.0`–`3.0.2` do not export it. See [PR #9299](https://github.com/payloadcms/payload/pull/9299).
- `formatLabels` is exported from the Payload root entry in every `3.x` release from `3.0.0` through `3.94.2` (129 releases checked). Its implementation is identical in every release, and every release depends on `pluralize@8.0.0`.
- `formatLabels` is exported from `payload/shared` only from `3.31.0`. The package imports it from the root entry, so the `^3.1.1` peer range is preserved without a private import or new dependency.
- Derived prefixes match across the four integration fixtures (`3.1.1`, `3.68.4`, `3.71.0`, `3.94.2`) over a 39-slug corpus that covers regular, irregular, uncountable, compound, camel-case, acronym, underscore, digit, and non-ASCII slugs.
- Payload detects custom IDs from a root-level `id` field before it traverses layout fields. Prepending the plugin-owned field avoids the nested-layout defects in [issue #13695](https://github.com/payloadcms/payload/issues/13695) and [issue #14927](https://github.com/payloadcms/payload/issues/14927).
- TypeID specification: <https://github.com/jetify-com/typeid/blob/main/spec/README.md> and the official vectors in `tests/fixtures`.
- UUIDv7: <https://www.rfc-editor.org/rfc/rfc9562.html#section-5.7>.

## Public API

- `typeId(options?)` is a Payload plugin. It manages only collections whose effective setting is `true` or a prefix string.
- `CollectionConfig.custom.typeId` accepts `true`, a prefix string, `false`, or `undefined`. The key is camelCase. The obsolete `custom.typeid` key throws a configuration error.
- `TypeIdOptions` exposes only `collections`. Each value is `true`, `false`, or a prefix string. The type is inline; no additional exported type exists.
- Payload's `CollectionCustom` and `GlobalCustom` accept `Record<string, any>` in the inspected releases. Consumers type `custom.typeId` without module augmentation.
- `generateTypeId(prefix)`, `parseTypeId(value)`, `isTypeId(value, expectedPrefix?)`, `fromUUID(prefix, uuid)`, and `toUUID(value)` implement the TypeID codec locally.
- `TypeID<Prefix>` is a compile-time template-literal type, not runtime proof.
- Payload-generated document types keep `id: string`.

## Opt-in and precedence

- Registering `typeId()` changes no collection by itself. An empty or omitted `collections` map manages nothing.
- Each setting has four states:

| Value                 | Effective result                                                    |
| --------------------- | ------------------------------------------------------------------- |
| `true`                | Managed; prefix derived from the collection slug.                   |
| prefix string         | Managed; prefix used exactly as written.                            |
| `false`               | Unmanaged; native ID strategy preserved.                            |
| omitted / `undefined` | Inherits the central value; unmanaged when no central value exists. |

- Precedence: model `custom.typeId` (including `true` and `false`), then central `collections[slug]`, then unmanaged.
- The resolver runs before prefix derivation and validation. Shadowed central prefixes are not validated, and they cannot cause collisions.
- Structural errors are still reported for shadowed central values: invalid types and unknown collection slugs.

## Prefix derivation

- Derivation uses only the collection slug. Labels, translated names, GraphQL names, TypeScript names, and `dbName` are ignored.
- The derivation replaces `_` with `-`, calls `formatLabels(slug).singular` from the Payload root entry, splits on spaces, lowercases the words, and joins them with `_`.
- The derivation rejects a result when any word contains a character outside ASCII letters, or when a multi-word result contains a one-letter word. One-letter words come from acronym splitting in `formatLabels`, such as `APIKeys` to `A P I Key`.
- Rejected examples: `APIKeys`, `HTMLPages`, `FAQs`, `a-b`, `users-2fa`, `uploads-v2`, `café-menus`, and `email/templates`. The error recommends an explicit prefix.
- Accepted examples: `articles` to `article`, `article-authors` to `article_author`, `ArticleAuthors` to `article_author`, `Article_Tags` to `article_tag`, `people` to `person`, `criteria` to `criterion`, `news` to `news`, and `data` to `datum`. The `data` result shows that pluralization can produce an undesirable word; an explicit prefix is the remedy.
- No inflection engine, dependency, private Payload import, or suffix/counter scheme is added.

## Explicit prefix validation

- Explicit prefixes are validated exactly. They are not singularized, lowercased, trimmed, or otherwise normalized.
- Grammar: `^([a-z]([a-z_]{0,61}[a-z])?)?$`, maximum length 63. The plugin additionally rejects the empty string.
- Duplicate effective prefixes among managed collections fail with both collection slugs in the message. Collision checks use only resolved managed prefixes. No automatic suffixes or namespaces are added.

## Identifier contract

- TypeID follows the official format: optional prefix, `_` separator, and 26 lowercase Crockford Base32 characters encoding 128 big-endian bits.
- Newly generated identifiers use UUIDv7 timestamps and secure random bits from `crypto.randomBytes`.
- Codec utilities accept prefixless values and non-v7 UUID payloads. `isTypeId` checks structure and overflow, not UUID version.
- The package does not guarantee monotonicity within one millisecond or across processes.

## Collection scope and lifecycle

- Managed collections receive one native hidden root-level text `id` field. Its field hooks generate IDs on create and duplicate. Its access settings disallow client updates.
- Collection operation hooks reject caller-supplied IDs on create (`data.id` and `customID`) and ID updates (`data.id`), including trusted override-access calls.
- A managed collection with its own root-level `id` field (including inside flattened row, collapsible, or unnamed-tab layouts) fails during plugin execution. Nested group, array, block, and named-tab fields named `id` are unaffected.
- Plugin order: `plugin.order = Number.MAX_SAFE_INTEGER`, which is honored by Payload `3.94.x`. Payload `3.1.1` applies plugins in array order, so consumers register `typeId()` after plugins that add collections.
- Globals are not collection documents. `custom.typeId` on a Global must be `false` or omitted. `true` and prefix strings throw.
- REST, GraphQL, Admin, and the Local API use the native Payload ID. No API translation, adapter patch, or extra field is used.

## Storage, compatibility, and existing data

- PostgreSQL 16 is the only adapter represented by the integration suite. Payload maps a custom `id: { type: 'text' }` to a `varchar` primary key. Relationship columns use the referenced collection's native ID type.
- The integration suite inspects primary, relationship, array/block parent, version, and internal-table column types. It also checks foreign-key type alignment.
- Global PostgreSQL `idType` is unchanged for unmanaged collections, Globals, versions, and adapter internals. `idType: "uuid"` is supported but not required.
- Enabling TypeIDs on an existing collection changes its primary key and relationship types. The plugin does not migrate existing IDs, relationships, or versions. Migrate data first or use a new database.
- Text identifiers use more index and storage space than native UUIDs. Prefixes also repeat in relationship values.
- Derived prefixes depend on Payload's pluralization rules. Consumers who need a prefix to stay fixed across Payload upgrades set an explicit prefix before creating records. The plugin does not change document IDs when a prefix changes; it only affects newly generated IDs.

## Errors, security, and performance

- Invalid codec inputs throw `TypeError`. `isTypeId` returns `false`.
- Caller-controlled IDs cannot select, impersonate, or mutate a managed document through Payload operations. Direct database writes are outside this protection.
- IDs are not credentials. Prefixes reveal entity type. UUIDv7 reveals approximate creation time. Authorization still governs access.
- Generation and conversion are synchronous, stateless, and local. They do not access the database or network.

## Verification

- Unit tests (`tests/index.test.ts`): official TypeID vectors, round trips, malformed inputs, UUIDv7 bits, concurrent generation, opt-in behavior, the full model/central precedence table, derivation (accepted and rejected slugs, label independence), explicit prefix validation, duplicate and shadowed-collision handling, obsolete key rejection, Global rules, layout-level ID conflicts, nested `id` fields, arrays and blocks, and ID ownership hooks.
- PostgreSQL integration (`tests/postgres.integration.ts`): run against `3.1.1`, `3.68.4`, `3.71.0`, and `3.94.2`, with default and UUID strategies. Covers central and model precedence, explicit exclusion, unspecified collections, collections introduced by other plugins, derived and explicit prefixes, managed/unmanaged relationships, uploads, polymorphic relationships, drafts and autosave, localization, duplication, Global rows, and column and foreign-key type checks.
- CI packed-consumer checks: TypeScript and runtime checks against the packed tarball. The consumer runtime check exercises opt-in and a derived prefix.

## Non-goals

No custom identifier fields, UUID mapping table, database extension or type, adapter patch, migration framework, API middleware, alternate ID strategy, telemetry, caches, Admin UI, global identifier registry, centralized Global configuration, configuration profiles, or additional singularization option.
