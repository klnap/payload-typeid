# @klnap/payload-typeid

Use [TypeIDs](https://github.com/jetify-com/typeid/blob/main/spec/README.md) as native Payload document IDs. A TypeID is a readable prefix plus a UUIDv7 in a compact suffix, for example `article_01m8d47saaepfr8kaw7mqdxs1h`. It is the document's one ID.

## Installation

```bash
bun add @klnap/payload-typeid
```

```bash
npm install @klnap/payload-typeid
```

## Quick start

Registering `typeId()` changes nothing by itself. A collection opts in with `custom.typeId`:

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

`articles` gets IDs such as `article_01m8d47saaepfr8kaw7mqdxs1h`. `users` keeps its native ID strategy. Register the plugin after plugins that add collections.

## Configuration

`custom.typeId` accepts:

| Value       | Effect                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| `"article"` | Manage the collection with this exact prefix.                                                         |
| `true`      | Derive a singular prefix from the slug: `articles` → `article`, `article-authors` → `article_author`. |
| `false`     | Keep the native ID strategy.                                                                          |
| omitted     | Inherit the central option, or keep the native strategy.                                              |

Central settings use the same values:

```ts
typeId({
  collections: { articles: "article", users: false },
});
```

**Precedence:** model configuration > central configuration > default (native strategy). A model-level `true` or `false` overrides the central value.

Globals accept only `false` or omission. Payload does not expose configurable Global document IDs.

Prefixes must be 1–63 lowercase ASCII letters or underscores, starting and ending with a letter. Derived prefixes are rejected when the slug is ambiguous, for example `APIKeys` or `users-2fa`; set an explicit prefix there. Singularization is only a convenience: `data` becomes `datum` and `dice` becomes `die`, so prefer explicit prefixes for such names.

The obsolete `custom.typeid` key throws during setup. Rename it to `custom.typeId`.

## Using IDs

```ts
const article = await payload.create({
  collection: "articles",
  data: { title: "Getting started with Payload CMS" },
});

await payload.findByID({ collection: "articles", id: article.id });
```

Relationships use the native ID: set `relationTo` as usual and pass the related document's `id`.

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

- Enabling TypeIDs on a collection with existing records changes its ID and relationship column types. Migrate the data before enabling it.
- Direct database writes bypass Payload hooks.
- Existing IDs and relationship values are not migrated automatically.

## Compatibility

| Area          | Support                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Payload CMS   | Peer range `^3.1.1`. PostgreSQL integration tests pass on `3.1.1`, `3.68.4`, `3.71.0`, and `3.94.2`. Payload 4 is unverified. |
| Database      | PostgreSQL 16, with the default serial strategy and `idType: "uuid"`. Other adapters are unverified.                          |
| Node.js       | `>=22.14.0`. Payload's own engine range applies too; Payload `3.94.2` requires `^22.23.5 \|\| ^24.22.3 \|\| >=26.13.1`.       |
| Module format | ESM only.                                                                                                                     |

## License

[MIT](./LICENSE)
