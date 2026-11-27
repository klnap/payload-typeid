# @klnap/payload-typeid

Readable, type-prefixed document IDs for Payload CMS.

```text
article_01m8d47saaepfr8kaw7mqdxs1h
author_01m8d47sabf8ca5x5s9smzr0qz
category_01m8d47sabeyjvrxppjadz5h5w
```

## Quick example

Register the plugin. Each collection gets a prefix from its slug, with no per-collection configuration:

```ts
// payload.config.ts
import { buildConfig, type CollectionConfig } from "payload";
import { typeId } from "@klnap/payload-typeid";

const Categories: CollectionConfig = {
  slug: "categories",
  fields: [{ name: "title", type: "text", required: true }],
};

const Authors: CollectionConfig = {
  slug: "authors",
  fields: [{ name: "name", type: "text", required: true }],
};

const Articles: CollectionConfig = {
  slug: "articles",
  fields: [
    { name: "title", type: "text", required: true },
    { name: "category", type: "relationship", relationTo: "categories", required: true },
    { name: "author", type: "relationship", relationTo: "authors", required: true },
  ],
};

export default buildConfig({
  // database, secret, editor, and the rest of your configuration
  collections: [Categories, Authors, Articles],
  plugins: [typeId()],
});
```

Use the normal Payload API. Relationships take the related document's `id`:

```ts
const category = await payload.create({ collection: "categories", data: { title: "Guides" } });
const author = await payload.create({ collection: "authors", data: { name: "Ada" } });

const article = await payload.create({
  collection: "articles",
  data: { title: "Getting started", category: category.id, author: author.id },
});

article.id; // for example "article_01m8d47saaepfr8kaw7mqdxs1h"
```

The ID is the document's only identifier. There is no second public ID field and no lookup table.

## Why?

Payload's default IDs do not show what kind of record an ID refers to in logs, URLs, or API responses. Projects sometimes add a second, readable identifier for that purpose, which duplicates the key and needs translation. This package keeps one identifier: the readable prefix is part of the native Payload ID.

## Features

- **Native IDs.** Managed collections use Payload's text ID field. Existing APIs and relationships work unchanged.
- **Automatic prefixes.** Each collection's prefix comes from its slug, singularized with Payload's own `formatLabels`.
- **Overrides.** Set a prefix per collection, opt a collection out, or configure all of them in one place.
- **ID ownership.** IDs are generated on create and duplicate. Callers cannot supply or change them through Payload operations.
- **PostgreSQL guards.** Triggers and a `CHECK` constraint apply the same rules to raw SQL writes.
- **Utilities.** Generate, validate, parse, and convert TypeIDs. No runtime dependencies.

## Installation

```bash
bun add @klnap/payload-typeid
```

```bash
npm install @klnap/payload-typeid
```

## Configuration

### Prefixes

Each collection's prefix is resolved in this order. The first defined value wins:

1. `custom.typeId` on the collection.
2. The central `collections` option passed to `typeId()`.
3. The automatic prefix from the slug.

`custom.typeId` accepts:

| Value   | Effect                                                                     |
| ------- | -------------------------------------------------------------------------- |
| `"art"` | Use this exact prefix.                                                     |
| `true`  | Use the automatic prefix, even when the central option sets another value. |
| `false` | Opt out: keep Payload's native ID strategy.                                |
| omitted | Use the central option, or the automatic prefix.                           |

Configure a whole project in one place with the same values:

```ts
typeId({
  collections: {
    articles: "article",
    authors: "author",
    categories: false,
  },
});
```

Precedence for each combination of collection-level and central values:

| `custom.typeId` | Central value | Result              |
| --------------- | ------------- | ------------------- |
| omitted         | omitted       | Automatic prefix    |
| `true`          | omitted       | Automatic prefix    |
| `true`          | `"article"`   | Automatic prefix    |
| `true`          | `false`       | Automatic prefix    |
| `"art"`         | `"article"`   | `art`               |
| `"art"`         | `false`       | `art`               |
| omitted         | `"article"`   | `article`           |
| omitted         | `false`       | Native ID (opt-out) |
| `false`         | `"article"`   | Native ID (opt-out) |
| `false`         | `true`        | Native ID (opt-out) |

Central keys must be collection slugs in `config.collections`. An unknown key throws during setup.

### Automatic prefixes

Automatic prefixes use the slug, with the last word singularized by Payload's `formatLabels`:

| Collection slug   | Prefix           |
| ----------------- | ---------------- |
| `articles`        | `article`        |
| `authors`         | `author`         |
| `categories`      | `category`       |
| `article-authors` | `article_author` |

Automatic prefixes are convenient but follow Payload's English rules. Set an explicit prefix when a name is irregular, when it is domain-specific, or when the prefix is a stable part of your API. An explicit prefix must be 1–63 lowercase ASCII letters or underscores, starting and ending with a letter.

The plugin rejects a slug whose label cannot be split into words reliably (for example `APIKeys` or `users-2fa`). Those collections need an explicit prefix or `false`.

Two managed collections that resolve to the same prefix are rejected during setup. Changing a prefix does not change existing IDs; see [Existing databases](#existing-databases).

### Globals

TypeIDs apply to collections only. Globals are accessed by slug and keep Payload's native behavior, so no configuration is needed. Setting `custom.typeId` to `false` on a Global is allowed. Setting it to `true` or to a prefix string throws during setup.

### Obsolete key

Use `custom.typeId`. The obsolete `custom.typeid` spelling is rejected on collections and Globals.

## ID ownership

For managed collections, the plugin owns the ID:

- **Create** generates a TypeID. Passing `id`, `data.id`, or `customID` throws.
- **Update** cannot change the ID. Passing `data.id` throws.
- **Duplicate** creates a new TypeID with the same prefix. The original keeps its ID.

These rules apply to Payload operations. Raw SQL writes are covered by the database guards below.

```ts
const copy = await payload.duplicate({ collection: "articles", id: article.id });
copy.id !== article.id; // true
```

Payload's `idType` setting for the database adapter does not need to change.

## Database guards (PostgreSQL)

For each managed table, the plugin installs database-level rules when Payload starts. They apply to any write to that table, including raw SQL:

| Guarantee              | Provided by                                                     |
| ---------------------- | --------------------------------------------------------------- |
| ID generation          | A trigger that creates an ID when an `INSERT` has none.         |
| Format validation      | A `CHECK` constraint on the prefix and the 26-character suffix. |
| Immutability           | A trigger that rejects an `UPDATE` changing `id`.               |
| Primary-key uniqueness | Payload's `PRIMARY KEY (id)`.                                   |
| Referential integrity  | Foreign keys from relationship and version tables to `id`.      |

Notes:

- A generated ID is a UUIDv7 in TypeID form. The generator follows RFC 9562 and matches `generateTypeId`.
- The `CHECK` validates the prefix and the suffix's characters and length. It does not verify the UUID version or variant bits.
- A correctly formatted ID supplied in a raw `INSERT` is accepted. Payload operations reject supplied IDs; the database does not.
- The guards cover managed tables only, not other tables in the database.
- Versions and relationship tables are protected through their foreign keys to the managed `id` columns, not through their own triggers.

### Startup requirements

Guard installation runs when Payload starts. It compares each function, constraint, and trigger with its expected definition and runs DDL only for objects that are missing or different. A database that is already up to date needs no DDL, so a runtime role without table-owner rights can still start.

- Each managed table must already exist in the schema Payload uses (see below). The plugin reports a missing table.
- The first installation, or a plugin upgrade that changes a function body, needs a role that owns the affected functions and tables.
- Existing rows must satisfy the `CHECK`. If they do not, startup fails and no guard is installed. Migrate those rows first.
- Guards are created in the schema set by `schemaName` in the Payload database adapter. Without `schemaName`, objects are unqualified and resolve through `search_path`, as Payload's tables do.
- The functions use `gen_random_uuid()`, built into PostgreSQL 13 and later.

The integration suite covers a non-default schema with a same-named table in `public`, a restricted runtime role starting on up-to-date guards, and opt-out after activation. It does not cover concurrent first installations or privilege combinations beyond these.

### What the guards cannot stop

A superuser can disable triggers or constraints. `DROP`, `TRUNCATE`, and restoring an older backup bypass all rules. Keep those privileges with migrations and operators.

## Existing databases

Enabling TypeIDs on a populated database is a migration, not a configuration change:

- Existing IDs and relationship values are not converted.
- The ID column type of managed tables and of the references to them changes.
- Startup fails if existing rows do not match the `CHECK`.

To keep a collection on its native IDs, set `custom.typeId: false` before the first start with the plugin.

After the plugin has activated on a database, setting `custom.typeId: false` does not restore column types, convert IDs, rewrite references, or remove guards. The collection keeps generating TypeIDs. Opting out is only a clean change before the first activation.

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

isTypeId(id); // true
isTypeId(id, "article"); // true
isTypeId(id, "author"); // false

const uuid = parseTypeId(id).uuid; // canonical UUID string
fromUUID("article", uuid) === id; // true
toUUID(id) === uuid; // true
```

| Export                             | Description                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| `generateTypeId(prefix)`           | Returns a TypeID with a new UUIDv7.                                          |
| `isTypeId(value, expectedPrefix?)` | Runtime check that `value` is a valid TypeID, optionally with that prefix.   |
| `parseTypeId(value)`               | Returns `{ prefix, uuid }`. Throws `TypeError` on invalid input.             |
| `fromUUID(prefix, uuid)`           | Encodes a canonical UUID as a TypeID. Accepts UUIDs of any version.          |
| `toUUID(value)`                    | Returns the canonical UUID of a TypeID. Throws `TypeError` on invalid input. |
| `TypeID<Prefix>`                   | Compile-time string type. It does not validate values at runtime.            |
| `TypeIdOptions`                    | The options type for `typeId()`.                                             |

`TypeID<Prefix>` documents intent in your types. Use `isTypeId` to check untrusted input. Generated Payload document types do not know which prefix a collection uses.

## Compatibility

| Area          | Support                                                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Payload       | Peer range `^3.1.1`. PostgreSQL integration tests run on `3.1.1`, `3.68.4`, `3.71.0`, and the development version (currently `3.94.2`). Other 3.x versions are not tested. Payload 4 is unverified.     |
| Database      | PostgreSQL integration tests run on PostgreSQL 16, with the default serial ID strategy and `idType: "uuid"`. Guards are PostgreSQL-only; other adapters log a warning and keep application-level rules. |
| Node.js       | `>=22.14.0`. Payload's own engine requirements also apply.                                                                                                                                              |
| Module format | ESM only.                                                                                                                                                                                               |

## Security

TypeIDs identify documents. They do not authenticate users or authorize access. Use Payload's access control and your application's authorization for every operation. The UUIDv7 part includes a timestamp, and the prefix reveals the record type, so do not treat IDs as secrets.

## Documentation

- [Payload custom ID fields](https://payloadcms.com/docs/fields/default-fields#custom-id-fields)
- [RFC 9562, UUIDv7](https://www.rfc-editor.org/rfc/rfc9562.html#section-5.7)
- [TypeID format specification](https://github.com/jetify-com/typeid/blob/main/spec/README.md), which this package's encoding follows

## License

[MIT](./LICENSE)
