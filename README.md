# @klnap/payload-typeid

Readable, type-prefixed document IDs for Payload CMS. An ID is a prefix plus a UUIDv7 in a compact suffix:

```text
article_01m8d47saaepfr8kaw7mqdxs1h
```

It is the document's one native Payload ID. The package adds no second identifier and no runtime dependencies.

## What changes

Registering the plugin changes nothing by itself. Each collection opts in with `custom.typeId`.

| Collection                   | Without opt-in      | With `custom.typeId: "article"`      |
| ---------------------------- | ------------------- | ------------------------------------ |
| `articles`                   | Payload's native ID | `article_01m8d47saaepfr8kaw7mqdxs1h` |
| `users` (no `custom.typeId`) | Payload's native ID | Payload's native ID                  |

New documents in opted-in collections receive a TypeID on create and on duplicate. Existing documents keep their IDs until you migrate them; see [Enabling on existing data](#enabling-on-existing-data).

## Installation

```bash
bun add @klnap/payload-typeid
```

```bash
npm install @klnap/payload-typeid
```

## Quick start

```ts
import { buildConfig, type CollectionConfig } from "payload";
import { typeId } from "@klnap/payload-typeid";

const Articles: CollectionConfig = {
  slug: "articles",
  custom: { typeId: "article" },
  fields: [],
};

const Users: CollectionConfig = {
  slug: "users",
  fields: [],
};

export default buildConfig({
  collections: [Articles, Users],
  plugins: [typeId()],
});
```

Register `typeId()` after plugins that add collections, so it sees the final collection list.

## How it works

The plugin uses Payload's native custom ID mechanism, a top-level field named `id`. It does not change the database adapter. For each managed collection, it:

- prepends an `id` text field whose `defaultValue` generates a TypeID with the collection's prefix;
- adds a `beforeChange` hook that keeps the generated ID on create, keeps the stored ID on update, and generates a fresh ID on duplicate;
- adds a `beforeOperation` guard that rejects `customID` and `data.id` on create and `data.id` on update, because the plugin owns the ID.

The plugin runs last (`order` is the maximum), so its `id` field and hooks apply after other plugins.

## Configuration

### On the collection: `custom.typeId`

| Value       | Effect                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| `"article"` | Manage the collection with exactly this prefix.                                                              |
| `true`      | Derive the prefix from the slug with Payload's singularization. See [Prefix derivation](#prefix-derivation). |
| `false`     | Keep the native ID strategy, even if the central option names this collection.                               |
| omitted     | Use the central option if it names this collection; otherwise the collection is unmanaged.                   |

### Centrally: `typeId({ collections })`

```ts
typeId({
  collections: {
    articles: "article",
    authors: true,
    users: false,
  },
});
```

The keys are collection slugs that must exist in `config.collections`. An unknown slug throws during setup.

### Precedence

For each collection, the plugin resolves the setting in this order and stops at the first value that is set:

1. `custom.typeId` on the collection (`true`, a string, or `false`).
2. The central `collections` entry for its slug (`true`, a string, or `false`).
3. Otherwise the collection is unmanaged.

Examples:

| Collection `custom.typeId` | Central entry | Result           |
| -------------------------- | ------------- | ---------------- |
| `"art"`                    | `"article"`   | Prefix `art`     |
| `false`                    | `"article"`   | Unmanaged        |
| omitted                    | `"article"`   | Prefix `article` |
| omitted                    | `true`        | Derived prefix   |
| omitted                    | omitted       | Unmanaged        |

A collection-level value always wins over the central one. `false` at either level keeps the collection unmanaged.

### Globals

Globals accept only `false` or omission. Payload does not expose configurable Global document IDs, so `true` or a prefix string on a Global throws during setup.

### Obsolete key

`custom.typeid` (lowercase `d`) throws on collections and Globals. Rename it to `custom.typeId`.

## Prefix derivation

`custom.typeId: true` derives the prefix from the slug with the same singularization Payload uses for admin labels (`formatLabels` from `payload`):

1. Replace `_` with `-` in the slug, so underscores and hyphens both separate words.
2. Pass the result through `formatLabels`, which singularizes the last word.
3. Join the words with `_` and lowercase the result.

| Slug              | Derived prefix   |
| ----------------- | ---------------- |
| `articles`        | `article`        |
| `article-authors` | `article_author` |
| `ArticleAuthors`  | `article_author` |
| `audit-logs`      | `audit_log`      |
| `people`          | `person`         |
| `faqs`            | `faq`            |
| `data`            | `datum`          |
| `dice`            | `die`            |

Singularization is a convenience, not a guarantee. The plugin rejects a slug whose label contains characters other than letters, or whose multi-word label contains a single letter, because those cannot be split reliably:

| Slug        | Result                                          |
| ----------- | ----------------------------------------------- |
| `APIKeys`   | Rejected. The label splits into single letters. |
| `users-2fa` | Rejected. The label contains a digit.           |

For irregular or domain-specific names, set the prefix explicitly instead of relying on derivation.

## Overriding the prefix

Set a string to skip derivation:

```ts
// Model level: wins over any central entry.
custom: { typeId: "art" },

// Central:
typeId({ collections: { articles: "art" } });
```

Prefixes must be 1–63 lowercase ASCII letters or underscores, starting and ending with a letter. Two managed collections that resolve to the same prefix throw during setup, so give one of them an explicit prefix.

A managed collection cannot define its own top-level field named `id`. Either set `custom.typeId: false` on it or rename that field before enabling TypeIDs.

## Using IDs

Create and read documents as usual. Do not pass `id` or `customID`:

```ts
const article = await payload.create({
  collection: "articles",
  data: { title: "Getting started with Payload CMS" },
});

await payload.findByID({ collection: "articles", id: article.id });
```

Passing `customID` or `data.id` on create throws. Passing `data.id` on update throws, because the ID does not change.

Relationships use the native ID. Set `relationTo` as usual and pass the related document's `id`.

### Duplicating documents

`payload.duplicate()` gives the copy a **new** TypeID with the same prefix. The original keeps its ID. The repository's PostgreSQL integration test checks this on every supported Payload version.

```ts
const copy = await payload.duplicate({ collection: "articles", id: article.id });
copy.id !== article.id; // true
copy.id.startsWith("article_"); // true
```

### Errors

Setup and write errors come from the plugin. Each message names the fix:

| Message (starts with)                                                                 | Cause and fix                                                          |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `... uses the obsolete custom.typeid key`                                             | Rename `custom.typeid` to `custom.typeId`.                             |
| `Invalid TypeID configuration ... custom.typeId must be true, false, a prefix string` | The value has another type. Use one of the accepted values.            |
| `Collection "x" cannot derive a TypeID prefix from its slug`                          | The slug is ambiguous. Set `custom.typeId` to an explicit string.      |
| `Collections "a" and "b" resolve to duplicate TypeID prefix`                          | Two collections share a prefix. Set an explicit prefix on one of them. |
| `Global "x" cannot use custom.typeId`                                                 | Globals accept only `false` or omission.                               |
| `TypeID collections references unknown collection`                                    | A central key is not a collection slug in `config.collections`.        |
| `Collection "x" already has a collection-level field named "id"`                      | Rename that field, or set `custom.typeId: false` on the collection.    |
| `Collection "x" owns its IDs; omit customID and data.id when creating`                | Remove `customID` and `data.id` from the create call.                  |
| `Collection "x" IDs are immutable; omit data.id when updating`                        | Remove `data.id` from the update call.                                 |
| `Register typeId() only once`                                                         | Keep a single `typeId()` entry in `plugins`.                           |

## Utilities

```ts
import {
  fromUUID,
  generateTypeId,
  isTypeId,
  parseTypeId,
  toUUID,
  type TypeID,
} from "@klnap/payload-typeid";

const id: TypeID<"article"> = generateTypeId("article");
isTypeId(id, "article"); // true
isTypeId(id, "category"); // false

const uuid = "0188bac7-4afa-78aa-bc3b-bd1eef28d881";
toUUID(fromUUID("article", uuid)) === uuid; // true
```

| Export                             | Description                                   |
| ---------------------------------- | --------------------------------------------- |
| `typeId(options?)`                 | Creates the Payload plugin.                   |
| `generateTypeId(prefix)`           | Generates a TypeID with a new UUIDv7.         |
| `isTypeId(value, expectedPrefix?)` | Validates a TypeID and optionally its prefix. |
| `parseTypeId(value)`               | Returns the prefix and canonical UUID.        |
| `fromUUID(prefix, uuid)`           | Encodes a canonical UUID as a TypeID.         |
| `toUUID(value)`                    | Converts a TypeID to its canonical UUID.      |
| `TypeID<Prefix>`                   | Compile-time type. Not runtime validation.    |
| `TypeIdOptions`                    | Options accepted by `typeId()`.               |

`parseTypeId`, `fromUUID`, and `toUUID` throw `TypeError` on invalid input. `isTypeId` returns `false`.

## Enabling on existing data

Enabling TypeIDs on a collection with records changes its ID column type and the type of every relationship that points to it. Existing IDs and relationship values are not migrated automatically.

1. Back up the database.
2. Write a migration that assigns a TypeID to each existing document and rewrites relationship values to match.
3. Deploy the migration with `custom.typeId` set.
4. Verify relationships before removing old columns.

Direct database writes bypass Payload hooks, so they also bypass the ID rules.

## Compatibility

| Area          | Support                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Payload CMS   | Peer range `^3.1.1`. PostgreSQL integration tests pass on `3.1.1`, `3.68.4`, `3.71.0`, and `3.94.2`. Payload 4 is unverified. |
| Database      | PostgreSQL 16, with the default serial strategy and `idType: "uuid"`. Other adapters are unverified.                          |
| Node.js       | `>=22.14.0`. Payload's own engine range applies too; Payload `3.94.2` requires `^22.23.5 \|\| ^24.22.3 \|\| >=26.13.1`.       |
| Module format | ESM only.                                                                                                                     |

## License

[MIT](./LICENSE)
