import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { type Config, type Field, flattenAllFields } from "payload";
import {
  fromUUID,
  generateTypeId,
  isTypeId,
  parseTypeId,
  type TypeID,
  type TypeIdOptions,
  toUUID,
  typeId,
} from "../src/index.js";

const validVectors = JSON.parse(
  readFileSync(new URL("./fixtures/typeid-valid.json", import.meta.url), "utf8"),
) as Array<{ typeid: string; prefix: string; uuid: string }>;
const invalidVectors = [
  ...readFileSync(new URL("./fixtures/typeid-invalid.yml", import.meta.url), "utf8").matchAll(
    /^\s*typeid: "(.*)"$/gm,
  ),
].map(([, value]) => value);
const config = (slugs: string[], fields: object[] = []) =>
  ({
    collections: slugs.map((slug) => ({ slug, fields })),
    plugins: [],
  }) as unknown as Config;

test("matches every official valid TypeID vector", () => {
  for (const vector of validVectors) {
    expect(toUUID(vector.typeid)).toBe(vector.uuid);
    expect(fromUUID(vector.prefix, vector.uuid)).toBe(vector.typeid);
    expect(parseTypeId(vector.typeid)).toEqual({ prefix: vector.prefix, uuid: vector.uuid });
    expect(isTypeId(vector.typeid)).toBe(true);
  }
});

test("rejects every official invalid TypeID vector", () => {
  expect(invalidVectors).toHaveLength(21);
  for (const value of invalidVectors) {
    expect(isTypeId(value)).toBe(false);
    expect(() => parseTypeId(value)).toThrow(TypeError);
  }
});

test("generates UUIDv7 TypeIDs with secure UUID bits and timestamp", () => {
  const before = Date.now();
  const ids = Array.from({ length: 1_000 }, () => generateTypeId("user"));
  const after = Date.now();

  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) {
    expect(isTypeId(id, "user")).toBe(true);
    const { uuid } = parseTypeId(id);
    expect(uuid[14]).toBe("7");
    expect(["8", "9", "a", "b"]).toContain(uuid[19]);
    const timestamp = Number.parseInt(uuid.slice(0, 8) + uuid.slice(9, 13), 16);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  }
});

test("round-trips random UUIDs and canonical prefixes", () => {
  for (let index = 0; index < 500; index += 1) {
    const uuid = randomUUID();
    const typeid = fromUUID("random_test", uuid);
    expect(toUUID(typeid)).toBe(uuid);
    expect(fromUUID("random_test", uuid.toUpperCase())).toBe(typeid);
    expect(isTypeId(typeid, "random_test")).toBe(true);
    expect(isTypeId(typeid, "other")).toBe(false);
  }

  const prefixless = generateTypeId("");
  expect(prefixless).toHaveLength(26);
  expect(parseTypeId(prefixless).prefix).toBe("");
  expect(generateTypeId("a".repeat(63))).toStartWith(`${"a".repeat(63)}_`);
  expect(() => generateTypeId("a".repeat(64))).toThrow(/Invalid TypeID prefix/);
});

test("concurrent generation produces unique IDs in the sample", async () => {
  const ids = await Promise.all(
    Array.from({ length: 1_000 }, (_, index) =>
      Promise.resolve().then(() => generateTypeId(index % 2 ? "one" : "two")),
    ),
  );
  expect(new Set(ids).size).toBe(ids.length);
});

test("generates distinct IDs within the same millisecond", () => {
  const originalNow = Date.now;
  const timestamp = 1_700_000_000_000;
  Date.now = () => timestamp;
  let ids: TypeID<"article">[];
  try {
    ids = Array.from({ length: 1_000 }, () => generateTypeId("article"));
  } finally {
    Date.now = originalNow;
  }

  expect(new Set(ids).size).toBe(ids.length);
  const timestamps = new Set(
    ids.map((id) => {
      const uuid = parseTypeId(id).uuid;
      return uuid.slice(0, 8) + uuid.slice(9, 13);
    }),
  );
  expect(timestamps.size).toBe(1);
});

type TestCollection = { slug: string; fields: Field[]; custom?: Record<string, unknown> };
const runPlugin = (
  collections: TestCollection[],
  options?: TypeIdOptions,
  globals: object[] = [],
): Config => typeId(options)({ collections, globals, plugins: [] } as unknown as Config) as Config;
const idField = (fields: Field[]) =>
  fields.find((field) => "name" in field && field.name === "id") as
    | (Field & { defaultValue: () => string })
    | undefined;
const managedPrefix = (collection: { fields: Field[] } | undefined): string | false => {
  const field = collection && idField(collection.fields);
  if (!field || typeof field.defaultValue !== "function") return false;
  return parseTypeId(field.defaultValue()).prefix;
};

test("typeId() manages every collection by default with a derived prefix", () => {
  const collections = [
    { slug: "articles", fields: [] },
    { slug: "users", fields: [] },
  ];
  const result = runPlugin(collections, undefined);
  const emptyCentral = runPlugin(collections, { collections: {} });

  for (const config of [result, emptyCentral]) {
    expect(config.collections?.map((collection) => managedPrefix(collection))).toEqual([
      "article",
      "user",
    ]);
  }
});

test("model and central settings override the default per collection", () => {
  const result = runPlugin(
    [
      { slug: "articles", custom: { typeId: "art" }, fields: [] },
      { slug: "authors", fields: [] },
      { slug: "categories", fields: [] },
      { slug: "pages", fields: [] },
      { slug: "tags", custom: { typeId: false }, fields: [] },
    ],
    { collections: { categories: "category", pages: false, tags: true } },
  );

  expect(result.collections?.map((collection) => managedPrefix(collection))).toEqual([
    "art",
    "author",
    "category",
    false,
    false,
  ]);
});

test("a collection opted out with custom.typeId false keeps its ID strategy", () => {
  const optedOut = {
    slug: "plugin-documents",
    custom: { typeId: false },
    fields: [{ name: "title", type: "text" }] as unknown as Field[],
  };
  const result = runPlugin([optedOut, { slug: "notes", fields: [] }]);

  expect(result.collections?.[0]).toBe(optedOut);
  expect(managedPrefix(result.collections?.[1])).toBe("note");
});

test("resolves every model and central combination before validation", () => {
  const cases: Array<[boolean | string | undefined, boolean | string | undefined, string | false]> =
    [
      [undefined, undefined, "article"],
      [true, undefined, "article"],
      ["post", undefined, "post"],
      [false, undefined, false],
      [undefined, true, "article"],
      [undefined, "article", "article"],
      [false, true, "article"],
      [false, "article", "article"],
      [true, false, false],
      ["post", "article", "article"],
      ["post", true, "article"],
      [true, "article", "article"],
    ];
  for (const [central, model, expected] of cases) {
    const result = runPlugin(
      [{ slug: "articles", custom: model === undefined ? {} : { typeId: model }, fields: [] }],
      central === undefined ? undefined : { collections: { articles: central } },
    );
    expect({ central, model, prefix: managedPrefix(result.collections?.[0]) }).toEqual({
      central,
      model,
      prefix: expected,
    });
  }
});

test("explicit model false overrides a central prefix and preserves custom data", () => {
  const custom = { typeId: false, tracking: "editorial" };
  const collection = { slug: "articles", custom, fields: [] };
  const result = runPlugin([collection], { collections: { articles: "post" } });

  expect(result.collections?.[0]).toBe(collection);
  expect(result.collections?.[0]?.custom).toBe(custom);
});

test("no false collisions from shadowed central settings", () => {
  const result = runPlugin(
    [
      { slug: "articles", custom: { typeId: "article" }, fields: [] },
      { slug: "authors", custom: { typeId: false }, fields: [] },
      { slug: "categories", custom: { typeId: "category" }, fields: [] },
    ],
    { collections: { articles: "shared", authors: "shared", categories: "shared" } },
  );

  expect(result.collections?.map((collection) => managedPrefix(collection))).toEqual([
    "article",
    false,
    "category",
  ]);
  expect(() =>
    runPlugin(
      [
        { slug: "articles", fields: [] },
        { slug: "authors", fields: [] },
      ],
      { collections: { articles: "same", authors: "same" } },
    ),
  ).toThrow(/duplicate TypeID prefix/);
});

test("derives singular prefixes from slugs only", () => {
  const cases: Array<[string, string]> = [
    ["articles", "article"],
    ["authors", "author"],
    ["categories", "category"],
    ["pages", "page"],
    ["projects", "project"],
    ["article-authors", "article_author"],
    ["ArticleAuthors", "article_author"],
    ["Article_Tags", "article_tag"],
    ["audit-logs", "audit_log"],
    ["staff-members", "staff_member"],
    ["people", "person"],
    ["criteria", "criterion"],
    ["faqs", "faq"],
    ["news", "news"],
    ["status", "status"],
    ["sheep", "sheep"],
    ["my_page", "my_page"],
    ["x", "x"],
    ["data", "datum"],
  ];
  for (const [slug, prefix] of cases) {
    const first = managedPrefix(
      runPlugin([{ slug, custom: { typeId: true }, fields: [] }]).collections?.[0],
    );
    const second = managedPrefix(
      runPlugin([{ slug, custom: { typeId: true }, fields: [] }]).collections?.[0],
    );
    expect({ slug, prefix: first }).toEqual({ slug, prefix });
    expect(second).toBe(first);
  }
});

test("ignores labels, GraphQL names, and database names when deriving prefixes", () => {
  const result = runPlugin([
    {
      slug: "articles",
      custom: { typeId: true },
      labels: { singular: "Story", plural: "Stories" },
      graphQL: { singularName: "Story" },
      dbName: "stories",
      fields: [],
    } as TestCollection,
  ]);

  expect(managedPrefix(result.collections?.[0])).toBe("article");
});

test("rejects slugs that cannot derive a valid prefix and recommends an override", () => {
  for (const slug of [
    "APIKeys",
    "HTMLPages",
    "a-b",
    "café-menus",
    "users-2fa",
    "uploads-v2",
    "FAQs",
    "email/templates",
  ]) {
    expect(() => runPlugin([{ slug, custom: { typeId: true }, fields: [] }])).toThrow(
      new RegExp(
        `Collection "${slug.replace(/[/.+*?^${}()|[\]\\]/g, "\\$&")}" cannot derive a TypeID prefix`,
      ),
    );
    expect(() => runPlugin([{ slug, fields: [] }], { collections: { [slug]: true } })).toThrow(
      /explicit prefix string/,
    );
    expect(
      managedPrefix(
        runPlugin([{ slug, fields: [] }], { collections: { [slug]: "custom" } }).collections?.[0],
      ),
    ).toBe("custom");
  }
});

test("uses explicit overrides for undesirable derived prefixes and collisions", () => {
  const result = runPlugin(
    [
      { slug: "articles", custom: { typeId: true }, fields: [] },
      { slug: "article", fields: [] },
      { slug: "data", fields: [] },
    ],
    { collections: { article: "story", data: "record" } },
  );

  expect(result.collections?.map((collection) => managedPrefix(collection))).toEqual([
    "article",
    "story",
    "record",
  ]);
  expect(() =>
    runPlugin([
      { slug: "articles", custom: { typeId: true }, fields: [] },
      { slug: "article", custom: { typeId: true }, fields: [] },
    ]),
  ).toThrow(/"articles" and "article" resolve to duplicate TypeID prefix "article"/);
});

test("validates explicit prefixes exactly without singularizing or normalizing them", () => {
  expect(
    managedPrefix(
      runPlugin([{ slug: "articles", custom: { typeId: "editorial_articles" }, fields: [] }])
        .collections?.[0],
    ),
  ).toBe("editorial_articles");
  expect(
    managedPrefix(
      runPlugin([{ slug: "articles", custom: { typeId: "a".repeat(63) }, fields: [] }])
        .collections?.[0],
    ),
  ).toBe("a".repeat(63));
  for (const prefix of [
    "",
    "Article",
    "article-x",
    "_article",
    "article_",
    "1article",
    "a".repeat(64),
    "é",
  ]) {
    expect(() => runPlugin([{ slug: "articles", custom: { typeId: prefix }, fields: [] }])).toThrow(
      /Invalid TypeID prefix|empty TypeID prefix/,
    );
  }
});

test("rejects invalid setting types with actionable messages", () => {
  expect(() => runPlugin([{ slug: "articles", custom: { typeId: 42 }, fields: [] }])).toThrow(
    /custom\.typeId must be true, false, a prefix string, or undefined/,
  );
  expect(() =>
    runPlugin([{ slug: "articles", fields: [] }], {
      collections: { articles: 42 as unknown as string },
    }),
  ).toThrow(/must be true, false, or a prefix string/);
  expect(() =>
    runPlugin([{ slug: "articles", fields: [] }], { collections: null as never }),
  ).toThrow(/record of collection slugs/);
});

test("rejects unknown central collections even when a model setting shadows them", () => {
  expect(() =>
    runPlugin([{ slug: "articles", custom: { typeId: "article" }, fields: [] }], {
      collections: { articles: "post", unknown: true },
    }),
  ).toThrow(/unknown collection "unknown"/);
});

test("does not validate central prefixes shadowed by model settings", () => {
  const result = runPlugin([{ slug: "articles", custom: { typeId: "article" }, fields: [] }], {
    collections: { articles: "Not Valid" },
  });

  expect(managedPrefix(result.collections?.[0])).toBe("article");
});

test("rejects the obsolete custom.typeid spelling on collections and globals", () => {
  expect(() =>
    runPlugin([{ slug: "articles", custom: { typeid: "article" }, fields: [] }]),
  ).toThrow(/obsolete custom\.typeid key; rename it to custom\.typeId/);
  expect(() => runPlugin([{ slug: "users", custom: { typeid: false }, fields: [] }])).toThrow(
    /obsolete custom\.typeid key/,
  );
  expect(() =>
    runPlugin([], undefined, [{ slug: "site-settings", custom: { typeid: false }, fields: [] }]),
  ).toThrow(/obsolete custom\.typeid key/);
});

test("preserves unrelated custom properties", () => {
  const custom = { typeId: "article", tracking: "editorial" };
  const unmanagedCustom = { tracking: "editorial" };
  const result = runPlugin([
    { slug: "articles", custom, fields: [] },
    { slug: "authors", custom: unmanagedCustom, fields: [] },
  ]);

  expect(managedPrefix(result.collections?.[0])).toBe("article");
  expect(result.collections?.[0]?.custom).toBe(custom);
  expect(managedPrefix(result.collections?.[1])).toBe("author");
  expect(result.collections?.[1]?.custom).toBe(unmanagedCustom);
});

test("handles Globals without configurable IDs", () => {
  const omitted = { slug: "site-settings", fields: [] };
  const disabled = { slug: "footer", custom: { typeId: false }, fields: [] };
  const result = runPlugin([], undefined, [omitted, disabled]);

  expect(result.globals?.[0]).toBe(omitted);
  expect(result.globals?.[1]).toBe(disabled);
  expect(() =>
    runPlugin([], undefined, [{ slug: "site-settings", custom: { typeId: true }, fields: [] }]),
  ).toThrow(/cannot use custom\.typeId true/);
  expect(() =>
    runPlugin([], undefined, [
      { slug: "site-settings", custom: { typeId: "settings" }, fields: [] },
    ]),
  ).toThrow(/cannot use custom\.typeId "settings"/);
  expect(() =>
    runPlugin([], undefined, [{ slug: "site-settings", custom: { typeId: 42 }, fields: [] }]),
  ).toThrow(/Invalid TypeID configuration for Global "site-settings"/);
});

test("rejects invalid prefixes, unknown collections, duplicate prefixes, and collection IDs", () => {
  expect(() => typeId({ collections: { users: "Bad" } })(config(["users"]))).toThrow(
    /Invalid TypeID prefix/,
  );
  expect(() => typeId({ collections: { unknown: "valid" } })(config(["users"]))).toThrow(
    /unknown collection/,
  );
  expect(() =>
    typeId({ collections: { users: "same", products: "same" } })(config(["users", "products"])),
  ).toThrow(/duplicate TypeID prefix/);
  expect(() =>
    typeId({ collections: { users: true } })(config(["users"], [{ name: "id", type: "text" }])),
  ).toThrow(/collection-level field named "id"/);
});

test("detects collection-level IDs inside flattened Payload layouts", () => {
  const id = { name: "id", type: "text" };
  const layouts: Field[] = [
    { type: "row", fields: [id] },
    { type: "collapsible", label: "Details", fields: [id] },
    { type: "tabs", tabs: [{ label: "Details", fields: [id] }] },
    { name: "id", type: "group", fields: [] },
  ] as unknown as Field[];

  for (const field of layouts) {
    expect(() =>
      typeId({ collections: { documents: true } })(config(["documents"], [field])),
    ).toThrow(/collection-level field named "id"/);
  }
});

test("allows nested fields named id and adds exactly one collection ID", async () => {
  const fields: Field[] = [
    { name: "metadata", type: "group", fields: [{ name: "id", type: "text" }] },
    { name: "items", type: "array", fields: [{ name: "id", type: "text" }] },
    {
      name: "body",
      type: "blocks",
      blocks: [{ slug: "copy", fields: [{ name: "id", type: "text" }] }],
    },
    {
      type: "tabs",
      tabs: [{ label: "Details", name: "details", fields: [{ name: "id", type: "text" }] }],
    },
  ] as unknown as Field[];
  const result = (await typeId({ collections: { documents: true } })(
    config(["documents"], fields),
  )) as Config;
  const collectionFields = result.collections?.[0]?.fields;
  if (!collectionFields) throw new Error("Expected configured collection fields.");

  expect(collectionFields[0]).toMatchObject({ name: "id", type: "text" });
  expect(
    flattenAllFields({ fields: collectionFields }).filter(
      (field) => "name" in field && field.name === "id",
    ),
  ).toHaveLength(1);
});

test("accepts PostgreSQL collections with arrays and blocks and prepends the ID", async () => {
  const fields = [
    { name: "items", type: "array", fields: [{ name: "value", type: "text" }] },
    { name: "body", type: "blocks", blocks: [{ slug: "copy", fields: [] }] },
  ] as unknown as Field[];
  const original = {
    collections: [{ slug: "projects", custom: { typeId: true }, fields }],
    db: { name: "postgres" },
    plugins: [],
  } as unknown as Config;
  const result = (await typeId()(original)) as Config;

  expect(result.collections?.[0]?.fields[0]).toMatchObject({ name: "id", type: "text" });
  expect(result.collections?.[0]?.fields.slice(1)).toEqual(fields);
});

test("normalizes and applies overrides without mutating config", async () => {
  const original = {
    collections: [
      { slug: "users", custom: { typeId: true }, fields: [] },
      { slug: "product-variants", fields: [] },
      { slug: "audit-logs", fields: [] },
    ],
    plugins: [],
  } as unknown as Config;
  const options = {
    collections: {
      users: "user",
      "product-variants": true,
      "audit-logs": false,
    },
  } as const;
  const result = (await typeId(options)(original)) as Config;

  expect(result).not.toBe(original);
  expect(original.collections?.[0]?.fields).toHaveLength(0);
  expect(result.collections?.map((collection) => managedPrefix(collection))).toEqual([
    "user",
    "product_variant",
    false,
  ]);
  expect(options.collections).toEqual({
    users: "user",
    "product-variants": true,
    "audit-logs": false,
  });
  expect(typeId().order).toBe(Number.MAX_SAFE_INTEGER);
});

test("rejects supplied IDs for creates and updates, even with access overrides", async () => {
  const collection = (
    await typeId({
      collections: { users: "user" },
    })({
      collections: [{ slug: "users", fields: [] }],
      plugins: [],
    } as unknown as Config)
  ).collections?.[0];
  if (!collection) throw new Error("Expected configured collection.");
  const beforeOperation = collection.hooks?.beforeOperation?.[0] as (args: {
    operation: "create" | "update";
    args: { customID?: string; data?: Record<string, unknown> };
  }) => unknown;

  expect(() =>
    beforeOperation({ operation: "create", args: { data: { id: "user_custom" } } }),
  ).toThrow(/owns its IDs/);
  expect(() => beforeOperation({ operation: "create", args: { customID: "user_custom" } })).toThrow(
    /owns its IDs/,
  );
  expect(() =>
    beforeOperation({ operation: "update", args: { data: { id: "user_custom" } } }),
  ).toThrow(/immutable/);
  expect(
    beforeOperation({ operation: "create", args: { data: { email: "a@example.com" } } }),
  ).toEqual({
    data: { email: "a@example.com" },
  });
});

const userID: TypeID<"user"> = generateTypeId("user");
void userID;
// @ts-expect-error Distinct TypeID prefixes are not interchangeable.
const wrongUserID: TypeID<"user"> = generateTypeId("product");
void wrongUserID;
