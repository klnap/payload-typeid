import type { Payload } from "payload";

export interface TypeIdTableGuard {
  slug: string;
  prefix: string;
}

const identifierPattern = /^[a-z_][a-z0-9_]*$/;
const prefixSafePattern = /^[a-z]([a-z_]{0,61}[a-z])?$/;

// Mirrors encodeUuid/decodeSuffix: a 128-bit value as 26 Base32 characters, most significant first.
const encodeFunction = `
CREATE OR REPLACE FUNCTION payload_typeid_encode(hex text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  value numeric := 0;
  remainder integer;
  result text := '';
  alphabet text := '0123456789abcdefghjkmnpqrstvwxyz';
BEGIN
  FOR i IN 1..32 LOOP
    value := value * 16 + ('x' || substr(hex, i, 1))::bit(4)::int;
  END LOOP;
  FOR i IN 1..26 LOOP
    remainder := (value % 32)::integer;
    result := substr(alphabet, remainder + 1, 1) || result;
    value := (value - remainder) / 32;
  END LOOP;
  RETURN result;
END $$;`;

// UUIDv7 as described by RFC 9562: 48-bit milliseconds, version 7, RFC variant, random bits.
const uuidV7Function = `
CREATE OR REPLACE FUNCTION payload_typeid_uuid_v7_hex() RETURNS text
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  millis bigint := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  random_hex text := replace(gen_random_uuid()::text, '-', '');
BEGIN
  RETURN lpad(to_hex(millis), 12, '0')
    || '7' || substr(random_hex, 14, 3)
    || to_hex((('x' || substr(random_hex, 17, 1))::bit(4)::int & 3) | 8)
    || substr(random_hex, 18, 15);
END $$;`;

// Generates an ID when none is supplied, and rejects any change to an existing ID.
const guardFunction = `
CREATE OR REPLACE FUNCTION payload_typeid_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'TypeID document IDs are immutable (table %)', TG_TABLE_NAME
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS NULL THEN
    NEW.id := TG_ARGV[0] || '_' || payload_typeid_encode(payload_typeid_uuid_v7_hex());
  END IF;
  RETURN NEW;
END $$;`;

// Payload's Postgres table name for a collection slug: camelCase and hyphens become underscores.
export function tableNameForSlug(slug: string): string {
  return slug
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

/** SQL that installs the ID functions, a per-table CHECK constraint, and a per-table trigger. */
export function typeIdDatabaseSql(
  guards: ReadonlyArray<{ table: string; prefix: string }>,
): string {
  const statements = [encodeFunction, uuidV7Function, guardFunction];
  for (const { table, prefix } of guards) {
    if (!identifierPattern.test(table) || !prefixSafePattern.test(prefix)) {
      throw new TypeError(`Refusing to guard unsafe table or prefix "${table}" / "${prefix}".`);
    }
    const constraint = `payload_typeid_${table}_id_check`;
    const trigger = `payload_typeid_${table}_guard`;
    statements.push(
      `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${constraint}";`,
      `ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" CHECK (id ~ '^${prefix}_[0-7][0-9a-hjkmnp-tv-z]{25}$');`,
      `DROP TRIGGER IF EXISTS "${trigger}" ON "${table}";`,
      `CREATE TRIGGER "${trigger}" BEFORE INSERT OR UPDATE ON "${table}" FOR EACH ROW EXECUTE FUNCTION payload_typeid_guard('${prefix}');`,
    );
  }
  return statements.join("\n");
}

type PostgresPool = { query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }> };

/**
 * Installs the database guards on the Postgres adapter. Other adapters get a warning instead:
 * the guards are SQL and cannot be applied to them.
 */
export async function installTypeIdDatabaseGuards(
  payload: Payload,
  guards: ReadonlyArray<TypeIdTableGuard>,
): Promise<void> {
  if (guards.length === 0) return;
  if (payload.db.name !== "postgres") {
    payload.logger.warn(
      `payload-typeid: database guards are only installed on PostgreSQL; the "${payload.db.name}" adapter keeps application-level rules only.`,
    );
    return;
  }

  const pool = (payload.db as unknown as { pool: PostgresPool }).pool;
  const tables = guards.map(({ slug, prefix }) => {
    const defaultName = tableNameForSlug(slug);
    const tableNameMap = (payload.db as unknown as { tableNameMap?: Map<string, string> })
      .tableNameMap;
    const table = tableNameMap?.get(defaultName) ?? defaultName;
    return { slug, prefix, table };
  });

  for (const { slug, table } of tables) {
    const { rows } = await pool.query("SELECT to_regclass($1) AS relation", [`"${table}"`]);
    if (!(rows[0] as { relation: unknown } | undefined)?.relation) {
      throw new TypeError(
        `payload-typeid: no table "${table}" for collection "${slug}". Set the collection's dbName or rename it before enabling TypeIDs.`,
      );
    }
  }

  await pool.query(typeIdDatabaseSql(tables.map(({ table, prefix }) => ({ table, prefix }))));
}
