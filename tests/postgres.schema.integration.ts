import { afterAll, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { buildConfig, type CollectionConfig, getPayload } from "payload";
import { Client } from "pg";
import { typeId } from "@klnap/payload-typeid";

const baseUrl = process.env.PAYLOAD_TYPEID_TEST_DATABASE_URL;
if (!baseUrl) {
  throw new Error(
    "PAYLOAD_TYPEID_TEST_DATABASE_URL must point to a disposable PostgreSQL database.",
  );
}

const suffix = randomBytes(4).toString("hex");
const role = `typeid_rt_${suffix}`;
const schema = `cms_${suffix}`;
const databases: string[] = [];

const adminUrl = new URL(baseUrl);
adminUrl.pathname = "/postgres";

function urlFor(database: string, user?: { name: string; password: string }): string {
  const url = new URL(baseUrl!);
  url.pathname = `/${database}`;
  if (user) {
    url.username = user.name;
    url.password = user.password;
  }
  return url.toString();
}

async function withClient<T>(url: string, run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

// Each test gets its own database so Payload's schema push never sees another test's tables.
async function freshDatabase(name: string): Promise<string> {
  const database = `typeid_${name}_${suffix}`;
  databases.push(database);
  await withClient(adminUrl.toString(), (client) => client.query(`CREATE DATABASE "${database}"`));
  return database;
}

afterAll(async () => {
  for (const payload of openInstances) await closePayload(payload).catch(() => undefined);
  await withClient(adminUrl.toString(), async (client) => {
    for (const database of databases) {
      await client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    }
    await client.query(`DROP ROLE IF EXISTS "${role}"`);
  });
});

function makeConfig(options: {
  url: string;
  schemaName?: string;
  push: boolean;
  optOut?: boolean;
}) {
  const articles: CollectionConfig = {
    slug: "articles",
    ...(options.optOut ? { custom: { typeId: false } } : {}),
    fields: [{ name: "title", type: "text" }],
  };
  return buildConfig({
    secret: "schema-test-secret-not-for-production",
    collections: [articles],
    db: postgresAdapter({
      idType: "uuid",
      push: options.push,
      schemaName: options.schemaName,
      pool: { connectionString: options.url },
    }),
    plugins: [typeId()],
  });
}

const openInstances: Array<Awaited<ReturnType<typeof getPayload>>> = [];

async function initPayload(options: Parameters<typeof makeConfig>[0], key: string) {
  const payload = await getPayload({ config: await makeConfig(options), key });
  openInstances.push(payload);
  return payload;
}

// db.destroy() alone can leave idle pool clients behind; DROP DATABASE ... FORCE then reports them.
async function closePayload(payload: Awaited<ReturnType<typeof getPayload>>) {
  await payload.db.destroy?.();
  const pool = (payload.db as unknown as { pool?: { ending?: boolean; end(): Promise<void> } })
    .pool;
  // db.destroy() may already have ended the pool; pg-pool rejects a second end(). On some Payload
  // versions end() waits for a client that is never released, so the wait is bounded and the
  // database drop below (WITH FORCE) closes whatever remains.
  if (pool && !pool.ending) {
    await Promise.race([pool.end(), new Promise((resolve) => setTimeout(resolve, 5000))]);
  }
}

function guardCounts(client: Client, tableSchema: string, table: string) {
  return client
    .query<{ constraints: number; triggers: number }>(
      `SELECT
         (SELECT count(*)::int FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = r.relnamespace
           WHERE n.nspname = $1 AND r.relname = $2 AND c.conname LIKE 'payload_typeid_%') AS constraints,
         (SELECT count(*)::int FROM pg_trigger t JOIN pg_class r ON r.oid = t.tgrelid
            JOIN pg_namespace n ON n.oid = r.relnamespace
           WHERE n.nspname = $1 AND r.relname = $2 AND NOT t.tgisinternal
             AND t.tgname LIKE 'payload_typeid_%') AS triggers`,
      [tableSchema, table],
    )
    .then(({ rows }) => rows[0]);
}

test("guards target the configured schema, not a same-named table in public", async () => {
  const database = await freshDatabase("schema");
  await withClient(urlFor(database), async (client) => {
    await client.query(`CREATE TABLE public.articles (id text PRIMARY KEY, sentinel text)`);
    await client.query(
      `INSERT INTO public.articles VALUES ('sentinel-1', 'do-not-touch'), ('not-a-typeid', 'bad row')`,
    );
  });

  const payload = await initPayload(
    { url: urlFor(database), schemaName: schema, push: true },
    `schema-${suffix}`,
  );
  try {
    await withClient(urlFor(database), async (client) => {
      expect(await guardCounts(client, "public", "articles")).toEqual({
        constraints: 0,
        triggers: 0,
      });
      expect(await guardCounts(client, schema, "articles")).toEqual({
        constraints: 1,
        triggers: 1,
      });

      const sentinel = await client.query(`SELECT sentinel FROM public.articles ORDER BY id`);
      expect(sentinel.rows.map((row) => row.sentinel)).toEqual(["bad row", "do-not-touch"]);

      await expect(
        client.query(
          `INSERT INTO "${schema}"."articles" (id, title) VALUES ('not-a-typeid', 'raw')`,
        ),
      ).rejects.toThrow(/payload_typeid_articles_id_check/);
    });
  } finally {
    await closePayload(payload);
  }
}, 120_000);

test("a restricted runtime role starts without DDL when the guards are already current", async () => {
  const database = await freshDatabase("role");
  const owner = await initPayload({ url: urlFor(database), push: true }, `owner-${suffix}`);
  await closePayload(owner);

  const password = `rt-${suffix}`;
  await withClient(urlFor(database), async (client) => {
    await client.query(`DROP ROLE IF EXISTS "${role}"`);
    await client.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}'`);
    await client.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
    await client.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`,
    );
  });

  const triggerOids = `SELECT string_agg(oid::text, ',' ORDER BY oid) AS oids FROM pg_trigger WHERE tgname LIKE 'payload_typeid_%'`;
  const before = await withClient(urlFor(database), (client) => client.query(triggerOids));

  const restricted = await initPayload(
    { url: urlFor(database, { name: role, password }), push: false },
    `rt-${suffix}`,
  );
  try {
    const created = await restricted.create({
      collection: "articles",
      data: { title: "via restricted role" },
    });
    expect(String(created.id).startsWith("article_")).toBe(true);
  } finally {
    await closePayload(restricted);
  }

  const after = await withClient(urlFor(database), (client) => client.query(triggerOids));
  expect(after.rows[0]?.oids).toBe(before.rows[0]?.oids);
}, 120_000);

test("opt-out after activation keeps existing guards and documents keep TypeIDs", async () => {
  const database = await freshDatabase("optout");
  const managed = await initPayload({ url: urlFor(database), push: true }, `managed-${suffix}`);
  await closePayload(managed);

  const optedOut = await initPayload(
    { url: urlFor(database), push: false, optOut: true },
    `optout-${suffix}`,
  );
  try {
    await withClient(urlFor(database), async (client) => {
      expect(await guardCounts(client, "public", "articles")).toEqual({
        constraints: 1,
        triggers: 1,
      });
    });
    const created = await optedOut.create({
      collection: "articles",
      data: { title: "after opt-out" },
    });
    expect(String(created.id).startsWith("article_")).toBe(true);
  } finally {
    await closePayload(optedOut);
  }
}, 120_000);
