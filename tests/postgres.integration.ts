import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { buildConfig, getPayload, type Plugin } from "payload";
import { fromUUID, isTypeId, parseTypeId, typeId } from "@klnap/payload-typeid";

const databaseURL = process.env.PAYLOAD_TYPEID_TEST_DATABASE_URL;
if (!databaseURL) {
  throw new Error(
    "PAYLOAD_TYPEID_TEST_DATABASE_URL must point to a disposable PostgreSQL database.",
  );
}
const postgresIDType = process.env.PAYLOAD_TYPEID_TEST_ID_TYPE ?? "default";
if (postgresIDType !== "default" && postgresIDType !== "uuid") {
  throw new Error('PAYLOAD_TYPEID_TEST_ID_TYPE must be "default" or "uuid".');
}
const adapterIDColumnType = postgresIDType === "uuid" ? "uuid" : "integer";

const tempDir = await mkdtemp(join(tmpdir(), "payload-typeid-"));
const uploadsDir = join(tempDir, "uploads");
const filePath = join(tempDir, "fixture.txt");
await mkdir(uploadsDir);
await writeFile(filePath, "TypeID upload integration fixture");

const pluginCollection: Plugin = (config) => ({
  ...config,
  collections: [
    ...(config.collections ?? []),
    {
      slug: "plugin-documents",
      fields: [{ name: "title", type: "text" }],
    },
  ],
});
pluginCollection.slug = "typeid-test-collection";
pluginCollection.order = 20;

const config = await buildConfig({
  secret: "typeid-integration-test-secret-not-for-production",
  admin: { user: "users", timezones: { supportedTimezones: [{ label: "UTC", value: "UTC" }] } },
  localization: { locales: ["en", "fr"], defaultLocale: "en" },
  collections: [
    {
      slug: "users",
      auth: true,
      custom: { typeId: false, integrationMetadata: "preserved" },
      fields: [{ name: "name", type: "text" }],
    },
    {
      slug: "notes",
      fields: [{ name: "body", type: "text" }],
    },
    {
      slug: "authors",
      custom: { typeId: "author" },
      fields: [{ name: "name", type: "text" }],
    },
    {
      slug: "media",
      upload: { staticDir: uploadsDir },
      fields: [{ name: "alt", type: "text" }],
    },
    {
      slug: "categories",
      fields: [{ name: "title", type: "text" }],
    },
    {
      slug: "articles",
      custom: { typeId: "article", integrationMetadata: "preserved" },
      access: { create: () => false },
      versions: { drafts: { autosave: true }, maxPerDoc: 20 },
      fields: [
        { name: "category", type: "relationship", relationTo: "categories", required: true },
        { name: "author", type: "relationship", relationTo: "authors", required: true },
        {
          name: "sections",
          type: "array",
          fields: [
            { name: "heading", type: "text" },
            {
              name: "rows",
              type: "array",
              fields: [{ name: "value", type: "text" }],
            },
          ],
        },
        {
          name: "body",
          type: "blocks",
          blocks: [
            {
              slug: "copy",
              fields: [
                { name: "text", type: "text" },
                {
                  name: "items",
                  type: "array",
                  fields: [{ name: "value", type: "text" }],
                },
              ],
            },
          ],
        },
        { name: "title", type: "text", localized: true },
        { name: "hero", type: "upload", relationTo: "media" },
        {
          name: "related",
          type: "relationship",
          relationTo: ["articles", "categories", "media"],
          hasMany: true,
        },
      ],
    },
  ],
  globals: [
    {
      slug: "site-settings",
      custom: { typeId: false },
      fields: [{ name: "cards", type: "array", fields: [{ name: "label", type: "text" }] }],
    },
  ],
  plugins: [
    pluginCollection,
    typeId({
      collections: {
        articles: false,
        authors: "writer",
        categories: true,
        media: false,
        "plugin-documents": "document",
        users: "user",
      },
    }),
  ],
  db: postgresAdapter({
    pool: { connectionString: databaseURL },
    ...(postgresIDType === "uuid" ? { idType: "uuid" } : {}),
  }),
  typescript: { autoGenerate: false },
});

let payload: Awaited<ReturnType<typeof getPayload>> | undefined;

afterAll(async () => {
  await payload?.db.destroy?.();
  await rm(tempDir, { recursive: true, force: true });
});

test("uses native TypeIDs with Payload and PostgreSQL adapter ID types", async () => {
  payload = await getPayload({ config });

  expect(payload.collections.articles.customIDType).toBe("text");
  expect(payload.collections.categories.customIDType).toBe("text");
  expect(payload.collections.authors.customIDType).toBe("text");
  expect(payload.collections["plugin-documents"].customIDType).toBe("text");
  expect(payload.collections.users.customIDType).toBeUndefined();
  expect(payload.collections.media.customIDType).toBeUndefined();
  expect(payload.collections.notes.customIDType).toBe("text");
  expect(payload.db.defaultIDType).toBe(postgresIDType === "uuid" ? "text" : "number");
  expect(
    payload.collections.articles.config.fields.filter(
      (field) => "name" in field && field.name === "id",
    ),
  ).toHaveLength(1);
  expect(payload.config.collections.find(({ slug }) => slug === "articles")?.custom).toEqual({
    typeId: "article",
    integrationMetadata: "preserved",
  });

  const author = await payload.create({
    collection: "authors",
    data: { name: "Test Author" },
    overrideAccess: true,
  });
  const media = await payload.create({
    collection: "media",
    data: { alt: "Text fixture" },
    filePath,
    overrideAccess: true,
  });
  const category = await payload.create({
    collection: "categories",
    data: { title: "Development" },
    overrideAccess: true,
  });

  expect(isTypeId(author.id, "author")).toBe(true);
  expect(isTypeId(media.id, "media")).toBe(false);
  expect(isTypeId(category.id, "category")).toBe(true);

  const pluginDocument = await payload.create({
    collection: "plugin-documents",
    data: { title: "Plugin-owned document" },
    overrideAccess: true,
  });
  const note = await payload.create({
    collection: "notes",
    data: { body: "Default-managed collection" },
    overrideAccess: true,
  });
  expect(isTypeId(pluginDocument.id, "document")).toBe(true);
  expect(isTypeId(note.id, "note")).toBe(true);

  const article = await payload.create({
    collection: "articles",
    data: {
      title: "Published",
      category: category.id,
      author: author.id,
      sections: [{ heading: "Nested", rows: [{ value: "array row" }] }],
      body: [{ blockType: "copy", text: "Block", items: [{ value: "block array" }] }],
      hero: media.id,
      related: [
        { relationTo: "categories", value: category.id },
        { relationTo: "media", value: media.id },
      ],
    },
    locale: "en",
    overrideAccess: true,
  });

  expect(isTypeId(article.id, "article")).toBe(true);
  await expect(
    payload.create({
      collection: "articles",
      data: {
        title: "Unauthorized",
        category: category.id,
        author: author.id,
      },
      overrideAccess: false,
    }),
  ).rejects.toThrow(/not allowed/i);
  await expect(
    payload.create({
      collection: "articles",
      data: {
        id: "articles_caller_supplied",
        title: "Caller supplied ID",
        category: category.id,
        author: author.id,
      },
      overrideAccess: true,
    }),
  ).rejects.toThrow(/owns its IDs/);
  await expect(
    payload.update({
      collection: "articles",
      id: article.id,
      data: { id: "articles_replacement", title: "Replacement ID" },
      overrideAccess: true,
    }),
  ).rejects.toThrow(/immutable/);
  expect(
    (
      await payload.findByID({
        collection: "articles",
        id: article.id,
        overrideAccess: true,
      })
    ).id,
  ).toBe(article.id);

  const articleRead = await payload.findByID({
    collection: "articles",
    id: article.id,
    depth: 1,
    locale: "en",
    overrideAccess: true,
  });
  expect(articleRead.sections?.[0]?.rows?.[0]?.value).toBe("array row");
  expect(articleRead.body?.[0]?.items?.[0]?.value).toBe("block array");
  expect(articleRead.category).toMatchObject({ id: category.id });
  expect(articleRead.author).toMatchObject({ id: author.id });
  expect(articleRead.hero).toMatchObject({ id: media.id });

  const draft = await payload.create({
    collection: "articles",
    data: {
      title: "Draft",
      category: category.id,
      author: author.id,
      sections: [{ heading: "Draft", rows: [{ value: "v1" }] }],
    },
    locale: "en",
    draft: true,
    overrideAccess: true,
  });
  await payload.update({
    collection: "articles",
    id: draft.id,
    data: { title: "Autosaved", sections: [{ heading: "Draft", rows: [{ value: "v2" }] }] },
    locale: "en",
    draft: true,
    overrideAccess: true,
  });
  const autosaved = await payload.findByID({
    collection: "articles",
    id: draft.id,
    draft: true,
    locale: "en",
    overrideAccess: true,
  });
  expect(autosaved.title).toBe("Autosaved");

  await payload.update({
    collection: "articles",
    id: draft.id,
    data: { title: "Published draft" },
    locale: "en",
    draft: false,
    overrideAccess: true,
  });
  const duplicate = await payload.duplicate({
    collection: "articles",
    id: article.id,
    locale: "en",
    overrideAccess: true,
  });
  expect(isTypeId(duplicate.id, "article")).toBe(true);
  expect(duplicate.id).not.toBe(article.id);

  await payload.update({
    collection: "articles",
    id: article.id,
    data: { title: "Projet publié" },
    locale: "fr",
    overrideAccess: true,
  });
  expect(
    (
      await payload.findByID({
        collection: "articles",
        id: article.id,
        locale: "fr",
        overrideAccess: true,
      })
    ).title,
  ).toBe("Projet publié");

  await payload.updateGlobal({
    slug: "site-settings",
    data: { cards: [{ label: "UUID-owned global row" }] },
    overrideAccess: true,
  });
  expect(
    (await payload.findGlobal({ slug: "site-settings", overrideAccess: true })).cards,
  ).toHaveLength(1);

  const activePayload = payload;
  if (!activePayload) throw new Error("Payload failed to initialize.");
  const concurrent = await Promise.all(
    Array.from({ length: 32 }, (_, index) =>
      activePayload.create({
        collection: "categories",
        data: { title: `Concurrent ${index}` },
        overrideAccess: true,
      }),
    ),
  );
  expect(new Set(concurrent.map(({ id }) => id)).size).toBe(concurrent.length);

  const columns = await payload.db.pool.query<{
    table_name: string;
    column_name: string;
    data_type: string;
  }>(
    `SELECT table_name, column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN (
          'articles', 'articles_sections', 'articles_sections_rows',
          'articles_blocks_copy', 'articles_blocks_copy_items', 'articles_rels',
           '_articles_v', '_articles_v_rels', '_articles_v_version_sections',
           '_articles_v_version_sections_rows', '_articles_v_blocks_copy',
           '_articles_v_locales', 'categories', 'media', 'authors', 'users',
           'site_settings', 'site_settings_cards', 'payload_locked_documents'
        )`,
  );
  const columnTypes = new Map(
    columns.rows.map(({ table_name, column_name, data_type }) => [
      `${table_name}.${column_name}`,
      data_type,
    ]),
  );
  expect(columnTypes.get("articles.id")).toBe("character varying");
  expect(columnTypes.get("articles.category_id")).toBe("character varying");
  expect(columnTypes.get("articles.author_id")).toBe("character varying");
  expect(columnTypes.get("articles_sections._parent_id")).toBe("character varying");
  expect(columnTypes.get("articles_sections_rows._parent_id")).toBe("character varying");
  expect(columnTypes.get("articles_blocks_copy._parent_id")).toBe("character varying");
  expect(columnTypes.get("_articles_v.id")).toBe(adapterIDColumnType);
  expect(columnTypes.get("_articles_v.parent_id")).toBe("character varying");
  expect(columnTypes.get("_articles_v_rels.parent_id")).toBe(adapterIDColumnType);
  expect(columnTypes.get("_articles_v_version_sections._parent_id")).toBe(adapterIDColumnType);
  expect(columnTypes.get("_articles_v_version_sections_rows._parent_id")).toBe(adapterIDColumnType);
  expect(columnTypes.get("articles_rels.media_id")).toBe(adapterIDColumnType);
  expect(columnTypes.get("articles_rels.categories_id")).toBe("character varying");
  expect(columnTypes.get("categories.id")).toBe("character varying");
  expect(columnTypes.get("media.id")).toBe(adapterIDColumnType);
  expect(columnTypes.get("authors.id")).toBe("character varying");
  expect(columnTypes.get("users.id")).toBe(adapterIDColumnType);
  expect(columnTypes.get("site_settings.id")).toBe(adapterIDColumnType);
  expect(columnTypes.get("site_settings_cards._parent_id")).toBe(adapterIDColumnType);
  expect(columnTypes.get("payload_locked_documents.id")).toBe(adapterIDColumnType);

  const mismatches = await payload.db.pool.query<{ count: number }>(
    `SELECT count(*)::int AS count
     FROM pg_constraint fk
     JOIN LATERAL unnest(fk.conkey) WITH ORDINALITY AS l(attnum, ord) ON true
     JOIN LATERAL unnest(fk.confkey) WITH ORDINALITY AS r(attnum, ord) ON r.ord = l.ord
     JOIN pg_attribute la ON la.attrelid = fk.conrelid AND la.attnum = l.attnum
     JOIN pg_attribute ra ON ra.attrelid = fk.confrelid AND ra.attnum = r.attnum
     WHERE fk.contype = 'f' AND la.atttypid <> ra.atttypid`,
  );
  expect(mismatches.rows[0]?.count).toBe(0);

  const indexes = await payload.db.pool.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename IN ('articles', 'articles_sections')`,
  );
  expect(indexes.rows.map(({ indexname }) => indexname)).toContain("articles_pkey");
  expect(indexes.rows.map(({ indexname }) => indexname)).toContain(
    "articles_sections_parent_id_idx",
  );
});

test("database guards generate, validate, and freeze IDs for raw SQL writes", async () => {
  if (!payload) throw new Error("payload must be initialized by the first test");
  const pool = (
    payload.db as unknown as {
      pool: {
        query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
      };
    }
  ).pool;

  // A raw insert without an ID gets a TypeID with the table's prefix from the trigger.
  const inserted = await pool.query(
    `INSERT INTO "notes" ("body") VALUES ('raw write') RETURNING "id"`,
  );
  const id = String(inserted.rows[0]?.id);
  expect(isTypeId(id, "note")).toBe(true);
  expect(parseTypeId(id).uuid[14]).toBe("7");

  // The SQL encoder matches the TypeScript encoder for the same UUID.
  const suffix = id.slice("note_".length);
  const encoded = await pool.query(
    `SELECT payload_typeid_encode(replace($1, '-', '')) AS "suffix"`,
    [parseTypeId(id).uuid],
  );
  expect(encoded.rows[0]?.suffix).toBe(suffix);
  expect(String(fromUUID("note", parseTypeId(id).uuid))).toBe(id);

  // A wrong prefix or a malformed suffix is rejected by the CHECK constraint.
  await expect(
    pool.query(`INSERT INTO "notes" ("id", "body") VALUES ($1, 'wrong prefix')`, [
      `article_${suffix}`,
    ]),
  ).rejects.toThrow(/payload_typeid_notes_id_check/);
  await expect(
    pool.query(
      `INSERT INTO "notes" ("id", "body") VALUES ('note_9zzzzzzzzzzzzzzzzzzzzzzzzz', 'bad')`,
    ),
  ).rejects.toThrow(/payload_typeid_notes_id_check/);

  // Changing an existing ID is rejected by the trigger; ordinary field updates still work.
  await expect(
    pool.query(`UPDATE "notes" SET "id" = $1 WHERE "id" = $2`, [
      `note_${suffix.slice(0, 25)}0`,
      id,
    ]),
  ).rejects.toThrow(/immutable/);
  await pool.query(`UPDATE "notes" SET "body" = 'updated raw write' WHERE "id" = $1`, [id]);
});

test("relationship and version rows cannot reference an ID that is not a managed document", async () => {
  if (!payload) throw new Error("payload must be initialized by the first test");
  const pool = (
    payload.db as unknown as {
      pool: {
        query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
      };
    }
  ).pool;

  const category = await payload.create({
    collection: "categories",
    data: { title: "Guarded relations" },
    overrideAccess: true,
  });
  const article = await payload.create({
    collection: "articles",
    data: {
      title: "Guarded relation target",
      category: category.id,
      author: (
        await payload.create({
          collection: "authors",
          data: { name: "Guarded author" },
          overrideAccess: true,
        })
      ).id,
    },
    overrideAccess: true,
  });

  // A relationship row to an existing TypeID succeeds; the foreign key is the enforcement point.
  await pool.query(
    `INSERT INTO "articles_rels" ("order", "parent_id", "path", "categories_id") VALUES (1, $1, 'related', $2)`,
    [article.id, category.id],
  );

  // A relationship row to a TypeID that no managed document has is rejected by the foreign key.
  await expect(
    pool.query(
      `INSERT INTO "articles_rels" ("order", "parent_id", "path", "categories_id") VALUES (2, $1, 'related', $2)`,
      [article.id, "category_01m8d47saaepfr8kaw7mqdxs1h"],
    ),
  ).rejects.toThrow(/articles_rels_categories_fk|foreign key/);

  // A version row cannot point at an ID that is not a managed article.
  await expect(
    pool.query(
      `INSERT INTO "_articles_v" ("parent_id", "created_at", "updated_at") VALUES ($1, now(), now())`,
      ["article_01m8d47saaepfr8kaw7mqdxs1h"],
    ),
  ).rejects.toThrow(/_articles_v_parent_id_articles_id_fk|foreign key/);
});
