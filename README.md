# @klnap/payload-typeid

Use [TypeIDs](https://github.com/jetify-com/typeid/blob/main/spec/README.md) as native Payload document IDs. A TypeID is a readable prefix plus a UUIDv7 in a compact suffix, for example `article_01m8d47saaepfr8kaw7mqdxs1h`. It stays the document's one ID.

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
  custom: { typeid: "article" },
  fields: [],
};

export default buildConfig({
  collections: [Articles],
  plugins: [typeId()],
});
```

Documents get IDs such as `article_01m8d47saaepfr8kaw7mqdxs1h`. Register the plugin after plugins that add collections.

## Configuration

Set the prefix on the collection, or exclude it with `false`:

```ts
export const Users: CollectionConfig = {
  slug: "users",
  custom: { typeid: false },
  fields: [],
};
```

`custom.typeid` takes a prefix string, `false`, or `undefined`. A string manages the collection with that prefix. `false` keeps its native ID strategy. `undefined` inherits the central option, then the default.

The same settings can live in the plugin call:

```ts
typeId({
  collections: { articles: "article", users: false },
});
```

Precedence: **model configuration > central configuration > default**. Without either, the prefix is the collection slug with hyphens replaced by underscores, e.g. `article-categories` becomes `article_categories`.

Prefixes must be 1–63 lowercase ASCII letters or underscores, starting and ending with a letter. Invalid prefixes, prefix collisions, unknown central slugs, and collections that already define an `id` field fail at setup.

## Using IDs

```ts
const article = await payload.create({
  collection: "articles",
  data: { title: "Getting started with Payload CMS" },
});

await payload.findByID({ collection: "articles", id: article.id });
```

Relationships use the native ID as usual: `relationTo: "categories"` and pass the related document's `id`.

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

## Limits

- Existing IDs and relationship values are not migrated. Migrate them before enabling the plugin on existing data.
- Direct database writes bypass Payload hooks.
- Globals keep Payload's adapter ID strategy. A Global prefix is rejected; `custom.typeid: false` is a no-op.

## Compatibility

| Area          | Support                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Payload CMS   | Peer range `^3.1.1`. PostgreSQL integration tests pass on `3.1.1`, `3.68.4`, `3.71.0`, and `3.94.2`. Payload 4 is unverified. |
| Database      | PostgreSQL 16, with the default serial strategy and `idType: "uuid"`. Other adapters are unverified.                          |
| Node.js       | `>=22.14.0`. Payload's own engine range applies too; Payload `3.94.2` requires `^22.23.5 \|\| ^24.22.3 \|\| >=26.13.1`.       |
| Module format | ESM only.                                                                                                                     |

## License

[MIT](./LICENSE)
