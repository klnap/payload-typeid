# @klnap/payload-typeid

Use TypeIDs as native document IDs in Payload CMS.

```ts
import { buildConfig, type CollectionConfig } from "payload";
import { typeId } from "@klnap/payload-typeid";

const Articles: CollectionConfig = {
  slug: "articles",
  custom: { typeid: "article" },
  fields: [],
};

const Authors: CollectionConfig = {
  slug: "authors",
  custom: { typeid: "author" },
  fields: [],
};

const Categories: CollectionConfig = {
  slug: "categories",
  custom: { typeid: "category" },
  fields: [],
};

export default buildConfig({
  collections: [Articles, Authors, Categories],
  plugins: [typeId()],
});
```

These explicit singular prefixes produce IDs such as:

```text
article_01m8d47saaepfr8kaw7mqdxs1h
author_01m8d47sabf8ca5x5s9smzr0qz
category_01m8d47sabeyjvrxppjadz5h5w
```

## Why?

TypeIDs make record types easier to recognize in logs, URLs, and API responses. They encode a UUIDv7 in a compact Base32 suffix and add a readable prefix. A TypeID remains the document's one native Payload ID; it does not add a second public identifier.

## Features

- Use TypeIDs as native Payload collection document IDs.
- Choose semantic prefixes on each collection or centrally in plugin options.
- Exclude collections while preserving their configured ID strategy.
- Generate new UUIDv7 IDs on document creation and duplication.
- Generate, validate, parse, and convert TypeIDs with the exported utilities.
- Add no third-party runtime dependencies.

## Installation

```bash
bun add @klnap/payload-typeid
```

```bash
npm install @klnap/payload-typeid
```

## Usage

### Create and find a document

Payload uses the generated TypeID directly for ordinary Local API operations:

```ts
const article = await payload.create({
  collection: "articles",
  data: { title: "Getting started with Payload CMS" },
});

const found = await payload.findByID({
  collection: "articles",
  id: article.id,
});
```

### Use a relationship

Define a normal Payload relationship:

```ts
{
  name: "category",
  type: "relationship",
  relationTo: "categories",
}
```

Pass the related document's native ID when creating an article:

```ts
const category = await payload.create({
  collection: "categories",
  data: { title: "Development" },
});

await payload.create({
  collection: "articles",
  data: {
    title: "Understanding TypeIDs",
    category: category.id,
  },
});
```

### Generate, validate, and convert IDs

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
isTypeId(id, "category"); // false

const uuid = "0188bac7-4afa-78aa-bc3b-bd1eef28d881";
const converted = fromUUID("article", uuid);
parseTypeId(converted).uuid === uuid; // true
toUUID(converted) === uuid; // true
```

| Export                             | Description                                         |
| ---------------------------------- | --------------------------------------------------- |
| `typeId(options?)`                 | Creates the Payload plugin.                         |
| `generateTypeId(prefix)`           | Generates a UUIDv7 TypeID.                          |
| `isTypeId(value, expectedPrefix?)` | Validates a TypeID and optionally its prefix.       |
| `parseTypeId(value)`               | Returns the prefix and canonical UUID.              |
| `fromUUID(prefix, uuid)`           | Encodes a canonical UUID as a TypeID.               |
| `toUUID(value)`                    | Converts a TypeID to its canonical UUID.            |
| `TypeID<Prefix>`                   | Compile-time string type constrained by its prefix. |
| `TypeIdOptions`                    | Options accepted by `typeId()`.                     |

Codec utilities accept empty prefixes and UUIDs of any version. Invalid inputs make `parseTypeId`, `fromUUID`, and `toUUID` throw `TypeError`; `isTypeId` returns `false`. `TypeID<Prefix>` is a compile-time aid, not runtime validation. Payload-generated document types expose `id: string`.

## Configuration

Set a semantic prefix or exclude a collection in its own Payload config:

```ts
import type { CollectionConfig } from "payload";

export const Articles: CollectionConfig = {
  slug: "articles",
  custom: { typeid: "article" },
  fields: [],
};

export const Users: CollectionConfig = {
  slug: "users",
  custom: { typeid: false },
  fields: [],
};
```

`custom.typeid` accepts a prefix string, `false`, or `undefined`. A string manages the collection with that prefix. `false` leaves its native ID strategy unchanged. Omitted or `undefined` values inherit the central plugin option, then the default.

Central settings are an alternative:

```ts
typeId({
  collections: {
    articles: "article",
    authors: "author",
    users: false,
  },
});
```

Precedence is **model configuration > central configuration > defaults**. Model settings override central prefixes and exclusions. Unspecified collections use the central setting when present; otherwise, the plugin derives a prefix from the unchanged collection slug.

Automatic prefixes lowercase the slug, replace hyphens with underscores, and separate camel-case and acronym boundaries. They do not singularize: `articles` becomes `articles`, and `article-categories` becomes `article_categories`. Singular prefixes such as `article` are explicit conventions, not a TypeID requirement.

Managed prefixes must be unique, non-empty, and 1–63 lowercase ASCII letters or underscores. They must start and end with a letter. Invalid prefixes, effective collisions, unknown central collection slugs, and existing collection-level `id` fields fail during plugin setup.

Register the plugin after plugins that add collections. Managed IDs use Payload's top-level text `id` field and remain immutable through Payload operations. Nested data fields named `id` are separate. Existing collection IDs and relationship values are not migrated; migrate them before enabling the plugin on existing data. Direct database writes bypass Payload hooks.

Globals remain under Payload's adapter ID strategy. Payload addresses Global operations by slug and does not expose a configurable native Global document ID. `custom.typeid: false` is accepted as a no-op; a Global prefix is rejected.

## Compatibility

| Area              | Support                                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Payload CMS       | Peer range `^3.1.1`; PostgreSQL integration tested with `3.1.1`, `3.68.4`, `3.71.0`, and `3.94.2`. Payload 4 is unverified.                               |
| Database adapters | PostgreSQL 16 tested with the default serial strategy and explicit `idType: "uuid"`. Other adapters are unverified.                                       |
| Node.js           | This package requires `>=22.14.0`. Follow the selected Payload release's engine range; Payload `3.94.2` requires `^22.23.5 \|\| ^24.22.3 \|\| >=26.13.1`. |
| Module format     | ESM only.                                                                                                                                                 |

Use the latest stable Payload 3.x for security fixes. The peer range describes compatibility, not a recommendation to run older releases.

## Documentation

- [Payload plugins](https://payloadcms.com/docs/plugins/overview)
- [Payload custom ID fields](https://payloadcms.com/docs/fields/default-fields#custom-id-fields)
- [Payload Globals](https://payloadcms.com/docs/configuration/globals)
- [TypeID specification](https://github.com/jetify-com/typeid/blob/main/spec/README.md)
- [UUIDv7 in RFC 9562](https://www.rfc-editor.org/rfc/rfc9562.html#section-5.7)

## License

[MIT](./LICENSE)
