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

test("normalizes and applies overrides without mutating config", async () => {
  const original = {
    collections: [
      { slug: "users", fields: [] },
      { slug: "product-variants", fields: [] },
      { slug: "APIKeys", fields: [] },
      { slug: "audit-logs", fields: [] },
    ],
    plugins: [],
  } as unknown as Config;
  const options = {
    collections: {
      users: "user",
      "audit-logs": false,
    },
  } as const;
  const result = (await typeId(options)(original)) as Config;

  expect(result).not.toBe(original);
  expect(original.collections?.[0]?.fields).toHaveLength(0);
  expect(
    result.collections?.map((collection) => {
      const field = collection.fields.find(
        (candidate) => "name" in candidate && candidate.name === "id",
      );
      return field && "name" in field ? field.name : null;
    }),
  ).toEqual(["id", "id", "id", null]);
  for (const [index, prefix] of ["user", "product_variants", "api_keys"].entries()) {
    const field = result.collections?.[index]?.fields.find(
      (candidate) => "name" in candidate && candidate.name === "id",
    );
    if (!field || !("defaultValue" in field) || typeof field.defaultValue !== "function") {
      throw new Error(`Expected TypeID field for collection index ${index}.`);
    }
    expect(parseTypeId(field.defaultValue({} as never)).prefix).toBe(prefix);
  }
  expect(options.collections).toEqual({ users: "user", "audit-logs": false });
  expect(typeId().order).toBe(Number.MAX_SAFE_INTEGER);
});

test("model-level settings override central collection options", async () => {
  const result = (await typeId({
    collections: {
      articles: "post",
      authors: "writer",
      users: false,
    },
  })({
    collections: [
      { slug: "articles", custom: { typeid: "article" }, fields: [] },
      { slug: "authors", custom: { typeid: false }, fields: [] },
      { slug: "users", custom: { typeid: "account" }, fields: [] },
    ],
    plugins: [],
  } as unknown as Config)) as Config;

  const prefixes = result.collections?.map((collection) => {
    const id = collection.fields.find((field) => "name" in field && field.name === "id");
    return id && "defaultValue" in id && typeof id.defaultValue === "function"
      ? parseTypeId(id.defaultValue({} as never)).prefix
      : false;
  });

  expect(prefixes).toEqual(["article", false, "account"]);
});

test("uses normalized slugs when model and central settings are absent", async () => {
  const result = (await typeId()({
    collections: [
      { slug: "articles", fields: [] },
      { slug: "article-categories", fields: [] },
    ],
    plugins: [],
  } as unknown as Config)) as Config;
  const prefixes = result.collections?.map((collection) => {
    const id = collection.fields[0];
    if (!id || !("defaultValue" in id) || typeof id.defaultValue !== "function") {
      throw new Error("Expected the default TypeID field.");
    }
    return parseTypeId(id.defaultValue({} as never)).prefix;
  });

  expect(prefixes).toEqual(["articles", "article_categories"]);
});

test("uses local settings without central options and preserves collection custom data", async () => {
  const custom = { typeid: "article", tracking: "editorial" };
  const result = (await typeId()({
    collections: [
      { slug: "articles", custom, fields: [] },
      { slug: "authors", custom: { typeid: false, tracking: "editorial" }, fields: [] },
    ],
    plugins: [],
  } as unknown as Config)) as Config;
  const articleID = result.collections?.[0]?.fields[0];

  expect(
    articleID && "defaultValue" in articleID && typeof articleID.defaultValue === "function",
  ).toBe(true);
  if (
    !articleID ||
    !("defaultValue" in articleID) ||
    typeof articleID.defaultValue !== "function"
  ) {
    throw new Error("Expected the article TypeID field.");
  }
  expect(parseTypeId(articleID.defaultValue({} as never)).prefix).toBe("article");
  expect(result.collections?.[0]?.custom).toBe(custom);
  expect(result.collections?.[1]?.fields).toHaveLength(0);
  expect(result.collections?.[1]?.custom).toEqual({ typeid: false, tracking: "editorial" });
});

test("inherits central settings when model typeid is undefined", async () => {
  const result = (await typeId({ collections: { articles: "post", authors: false } })({
    collections: [
      { slug: "articles", custom: { typeid: undefined, tracking: "editorial" }, fields: [] },
      { slug: "authors", custom: { typeid: undefined }, fields: [] },
    ],
    plugins: [],
  } as unknown as Config)) as Config;
  const articleID = result.collections?.[0]?.fields[0];

  if (
    !articleID ||
    !("defaultValue" in articleID) ||
    typeof articleID.defaultValue !== "function"
  ) {
    throw new Error("Expected the inherited article TypeID field.");
  }
  expect(parseTypeId(articleID.defaultValue({} as never)).prefix).toBe("post");
  expect(result.collections?.[1]?.fields).toHaveLength(0);
});

test("checks prefix collisions only after resolving model precedence", async () => {
  const result = (await typeId({
    collections: { articles: "shared", authors: "shared", categories: "shared" },
  })({
    collections: [
      { slug: "articles", custom: { typeid: "article" }, fields: [] },
      { slug: "authors", custom: { typeid: false }, fields: [] },
      { slug: "categories", custom: { typeid: "category" }, fields: [] },
    ],
    plugins: [],
  } as unknown as Config)) as Config;

  expect(result.collections?.map(({ fields }) => fields.length)).toEqual([1, 0, 1]);
  expect(() =>
    typeId()({
      collections: [
        { slug: "articles", custom: { typeid: "shared" }, fields: [] },
        { slug: "authors", custom: { typeid: "shared" }, fields: [] },
      ],
      plugins: [],
    } as unknown as Config),
  ).toThrow(/duplicate TypeID prefix/);
});

test("rejects invalid model prefixes and unsupported Global prefixes", async () => {
  expect(() =>
    typeId()({
      collections: [{ slug: "articles", custom: { typeid: "Article" }, fields: [] }],
      plugins: [],
    } as unknown as Config),
  ).toThrow(/Invalid TypeID prefix/);
  expect(() =>
    typeId()({
      collections: [{ slug: "articles", custom: { typeid: 42 }, fields: [] }],
      plugins: [],
    } as unknown as Config),
  ).toThrow(/custom\.typeid must be a prefix string, false, or undefined/);
  expect(() =>
    typeId()({
      collections: [],
      globals: [{ slug: "site-settings", custom: { typeid: "settings" }, fields: [] }],
      plugins: [],
    } as unknown as Config),
  ).toThrow(/Globals do not expose configurable document IDs/);

  const global = {
    slug: "site-settings",
    custom: { typeid: false, tracking: "editorial" },
    fields: [],
  };
  const result = await typeId()({
    collections: [],
    globals: [global],
    plugins: [],
  } as unknown as Config);
  expect(result.globals?.[0]).toBe(global);
});

test("rejects invalid prefixes, unknown collections, duplicate prefixes, and collection IDs", () => {
  expect(() => typeId()(config(["user2"]))).toThrow(/collections\["user2"\] override/);
  expect(() => typeId({ collections: { users: "Bad" } })(config(["users"]))).toThrow(
    /Invalid TypeID prefix/,
  );
  expect(() => typeId({ collections: { unknown: "valid" } })(config(["users"]))).toThrow(
    /unknown collection/,
  );
  expect(() =>
    typeId({ collections: { users: "same", products: "same" } })(config(["users", "products"])),
  ).toThrow(/duplicate TypeID prefix/);
  expect(() => typeId()(config(["users"], [{ name: "id", type: "text" }]))).toThrow(
    /collection-level field named "id"/,
  );
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
    expect(() => typeId()(config(["documents"], [field]))).toThrow(
      /collection-level field named "id"/,
    );
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
  const result = (await typeId()(config(["documents"], fields))) as Config;
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
    collections: [{ slug: "projects", fields }],
    db: { name: "postgres" },
    plugins: [],
  } as unknown as Config;
  const result = (await typeId()(original)) as Config;

  expect(result.collections?.[0]?.fields[0]).toMatchObject({ name: "id", type: "text" });
  expect(result.collections?.[0]?.fields.slice(1)).toEqual(fields);
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
