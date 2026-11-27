# @klnap/payload-typeid

Readable, type-prefixed document IDs for Payload CMS. An ID is a prefix plus a UUIDv7 in a compact suffix:

```text
article_01m8d47saaepfr8kaw7mqdxs1h
```

It is the document's one native Payload ID. The package adds no second identifier and no runtime dependencies.

## What changes

Registering `typeId()` manages **every collection** with a TypeID prefix derived from its slug. You do not need to configure each collection. Opt out or override where needed.

| Collection                             | Without `typeId()`  | With `typeId()`                      |
| -------------------------------------- | ------------------- | ------------------------------------ |
| `articles`                             | Payload's native ID | `article_01m8d47saaepfr8kaw7mqdxs1h` |
| `users`                                | Payload's native ID | `user_…`                             |
| `articles` with `custom.typeId: "art"` | Payload's native ID | `art_…`                              |
| `users` with `custom.typeId: false`    | Payload's native ID | Payload's native ID                  |

Globals are not affected: they keep Payload's ID strategy.

**Upgrading an existing project is a data migration.** Every managed collection changes its ID type and its relationship columns. Existing documents keep their IDs until you migrate them. Before you register `typeId()` on a project with data, either migrate that data or set `custom.typeId: false` on each collection you do not want to change. See [Enabling on existing data](#enabling-on-existing-data).

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

`articles` gets `article_…` IDs and `users` gets `user_…` IDs, with no per-collection configuration. Register `typeId()` after plugins that add collections, so it sees the final collection list.

## How it works

The plugin uses Payload's native custom ID mechanism, a top-level field named `id`. It does not change the database adapter. For each managed collection, it:

- prepends an `id` text field whose `defaultValue` generates a TypeID with the collection's prefix;
- adds a `beforeChange` hook that keeps the generated ID on create, keeps the stored ID on update, and generates a fresh ID on duplicate;
- adds a `beforeOperation` guard that rejects `customID` and `data.id` on create and `data.id` on update, because the plugin owns the ID.

The plugin runs last (`order` is the maximum), so its `id` field and hooks apply after other plugins.

## Configuration

Each collection's prefix is resolved in this order. The first value that is set wins:

1. `custom.typeId` on the collection.
2. The central `typeId({ collections })` entry for its slug.
3. The default: a prefix derived from the slug.

### On the collection: `custom.typeId`

| Value   | Effect                                                                        |
| ------- | ----------------------------------------------------------------------------- |
| `"art"` | Use exactly this prefix. Use it when the derived prefix is not what you want. |
| `true`  | Derive the prefix from the slug. Same as omitting the value.                  |
| `false` | Opt out: keep Payload's native ID strategy for this collection.               |
| omitted | Use the central entry, or derive the prefix from the slug.                    |

### Centrally: `typeId({ collections })`

```ts
typeId({
  collections: {
    articles: "article",
    authors: "writer",
    users: false,
  },
});
```

Keys are collection slugs that must exist in `config.collections`. An unknown slug throws during setup. A central value applies only when the collection's `custom.typeId` is omitted.

### Examples

| Collection `custom.typeId` | Central entry | Result                           |
| -------------------------- | ------------- | -------------------------------- |
| `"art"`                    | `"article"`   | `art_…`                          |
| omitted                    | `"article"`   | `article_…`                      |
| `false`                    | `"article"`   | Native ID (opt-out)              |
| omitted                    | `false`       | Native ID (opt-out)              |
| omitted                    | omitted       | Derived prefix, e.g. `article_…` |

A collection-level value always wins. `false` at either level opts the collection out.

### Globals

Globals keep Payload's ID strategy. They accept only `false` or omission. `true` or a prefix string on a Global throws during setup, because Payload does not expose configurable Global document IDs.

### Obsolete key

`custom.typeid` (lowercase `d`) throws on collections and Globals. Rename it to `custom.typeId`.

## Prefix derivation

When no explicit prefix applies, the prefix comes from the slug with Payload's own singularization, `formatLabels` from `payload`, the same function Payload uses for admin labels:

1. Replace `_` with `-` in the slug, so underscores and hyphens both separate words.
2. Pass the result through `formatLabels`, which singularizes the last word.
3. Join the words with `_` and lowercase the result.

Regular plural nouns derive cleanly:

| Slug              | Derived prefix   |
| ----------------- | ---------------- |
| `articles`        | `article`        |
| `article-authors` | `article_author` |
| `ArticleAuthors`  | `article_author` |
| `audit-logs`      | `audit_log`      |
| `users`           | `user`           |

Irregular or uncountable names derive to correct English that may read oddly in an ID. Payload's English rules decide the result:

| Slug     | Derived prefix | Recommendation                                             |
| -------- | -------------- | ---------------------------------------------------------- |
| `people` | `person`       | Acceptable. Set `"person"` if you prefer an explicit name. |
| `data`   | `datum`        | Set an explicit prefix such as `"dataset"`.                |
| `dice`   | `die`          | Set an explicit prefix such as `"roll"`.                   |

Derivation depends on Payload's English rules. A future Payload release could change a derived prefix, and new IDs would follow the new rule. Set explicit prefixes for any collection whose IDs you store, log, or expose.

The plugin rejects a slug whose label contains characters other than letters, or whose multi-word label contains a single letter, because those cannot be split reliably. Because derivation is the default, such a slug fails setup for the whole project until you set a prefix or `false` on it:

| Slug        | Result                                          |
| ----------- | ----------------------------------------------- |
| `APIKeys`   | Rejected. The label splits into single letters. |
| `users-2fa` | Rejected. The label contains a digit.           |

## Prefix rules

Explicit prefixes must be 1–63 lowercase ASCII letters or underscores, starting and ending with a letter. Two managed collections that resolve to the same prefix throw during setup, so give one of them an explicit prefix.

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

| Message (starts with)                                                                 | Cause and fix                                                                 |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `... uses the obsolete custom.typeid key`                                             | Rename `custom.typeid` to `custom.typeId`.                                    |
| `Invalid TypeID configuration ... custom.typeId must be true, false, a prefix string` | The value has another type. Use one of the accepted values.                   |
| `Collection "x" cannot derive a TypeID prefix from its slug`                          | The slug is ambiguous. Set `custom.typeId` to an explicit string, or `false`. |
| `Collections "a" and "b" resolve to duplicate TypeID prefix`                          | Two collections share a prefix. Set an explicit prefix on one of them.        |
| `Global "x" cannot use custom.typeId`                                                 | Globals accept only `false` or omission.                                      |
| `TypeID collections references unknown collection`                                    | A central key is not a collection slug in `config.collections`.               |
| `Collection "x" already has a collection-level field named "id"`                      | Rename that field, or set `custom.typeId: false` on the collection.           |
| `Collection "x" owns its IDs; omit customID and data.id when creating`                | Remove `customID` and `data.id` from the create call.                         |
| `Collection "x" IDs are immutable; omit data.id when updating`                        | Remove `data.id` from the update call.                                        |
| `Register typeId() only once`                                                         | Keep a single `typeId()` entry in `plugins`.                                  |

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

Registering `typeId()` on a project with data changes the ID column type of every managed collection and of every relationship that points to it. Existing IDs and relationship values are not migrated automatically.

Choose one before you deploy:

1. **Migrate.** Back up the database. Write a migration that assigns a TypeID to each existing document and rewrites relationship values to match. Deploy it together with the plugin.
2. **Opt out.** Set `custom.typeId: false` on each existing collection you do not want to change. Only new collections get TypeIDs.

The database guards below run on writes that bypass Payload hooks. Existing data that does not match them blocks startup until it is migrated.

## Database guards (PostgreSQL)

Payload hooks do not run for raw SQL, so the plugin installs the ID rules in the database as well. For each managed table, on every Payload start:

- **Generation:** an `INSERT` without `id` receives a TypeID with the table's prefix. The SQL encoder matches `generateTypeId`, and the test suite checks that the two agree.
- **Validation:** a `CHECK` constraint rejects any `id` that is not `prefix_` followed by 26 Base32 characters, with the first character in `0`–`7`. A wrong prefix is rejected too.
- **Immutability:** a trigger rejects any `UPDATE` that changes `id`. Other columns can still be updated.

The guards are idempotent and survive a repeated `push`; the test suite runs twice against the same database to check this. Limits:

- **PostgreSQL only.** Other adapters log a warning at startup and keep only application-level rules.
- **Existing data.** The `CHECK` applies to all rows. If a managed table already holds IDs that do not match, startup fails and no guard is installed. Migrate those rows first (see [Enabling on existing data](#enabling-on-existing-data)).
- **Relations and versions.** Relationship join tables and versions tables are not guarded by triggers. Their references to managed documents are foreign keys to the guarded `id` columns, so a row cannot point at a TypeID that no managed document has. The integration suite checks this for both.
- **What the database cannot stop.** A superuser can disable triggers or constraints, and `DROP`, `TRUNCATE`, or restoring an old backup bypass every rule. Restrict those privileges to migrations. Other adapters are unguarded (see above).
- **Fields.** The guards check only `id`. Other constraints and field rules are not changed.

## Compatibility

| Area          | Support                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Payload CMS   | Peer range `^3.1.1`. PostgreSQL integration tests pass on `3.1.1`, `3.68.4`, `3.71.0`, and `3.94.2`. Payload 4 is unverified. |
| Database      | PostgreSQL 16, with the default serial strategy and `idType: "uuid"`. Other adapters are unverified.                          |
| Node.js       | `>=22.14.0`. Payload's own engine range applies too; Payload `3.94.2` requires `^22.23.5 \|\| ^24.22.3 \|\| >=26.13.1`.       |
| Module format | ESM only.                                                                                                                     |

## License

[MIT](./LICENSE)
