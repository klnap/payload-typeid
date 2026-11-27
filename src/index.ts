import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import {
  type CollectionConfig,
  type Config,
  type Field,
  flattenAllFields,
  type Payload,
  formatLabels,
  type Plugin,
} from "payload";

interface TypeIdTableGuard {
  slug: string;
  prefix: string;
}

const identifierPattern = /^[a-z_][a-z0-9_]*$/;
const prefixSafePattern = /^[a-z]([a-z_]{0,61}[a-z])?$/;

// Payload's Postgres table name for a collection slug: camelCase and hyphens become underscores.
function tableNameForSlug(slug: string): string {
  return slug
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

// Objects are qualified with the adapter's schema; without one they stay unqualified, like Payload's tables.
function qualifier(schema: string | undefined): (name: string) => string {
  return (name) => (schema ? `"${schema}"."${name}"` : `"${name}"`);
}

// Mirrors encodeUuid/decodeSuffix: a 128-bit value as 26 Base32 characters, most significant first.
function functionSpecs(q: (name: string) => string) {
  const specs = [
    {
      name: "payload_typeid_encode",
      args: "hex text",
      returns: "text",
      attributes: "LANGUAGE plpgsql IMMUTABLE",
      body: `
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
END `,
    },
    // UUIDv7 as described by RFC 9562: 48-bit milliseconds, version 7, RFC variant, random bits.
    {
      name: "payload_typeid_uuid_v7_hex",
      args: "",
      returns: "text",
      attributes: "LANGUAGE plpgsql VOLATILE",
      body: `
DECLARE
  millis bigint := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  random_hex text := replace(gen_random_uuid()::text, '-', '');
BEGIN
  RETURN lpad(to_hex(millis), 12, '0')
    || '7' || substr(random_hex, 14, 3)
    || to_hex((('x' || substr(random_hex, 17, 1))::bit(4)::int & 3) | 8)
    || substr(random_hex, 18, 15);
END `,
    },
    // Generates an ID when none is supplied, and rejects any change to an existing ID.
    {
      name: "payload_typeid_guard",
      args: "",
      returns: "trigger",
      attributes: "LANGUAGE plpgsql",
      body: `
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'TypeID document IDs are immutable (table %)', TG_TABLE_NAME
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS NULL THEN
    NEW.id := TG_ARGV[0] || '_' || ${q("payload_typeid_encode")}(${q("payload_typeid_uuid_v7_hex")}());
  END IF;
  RETURN NEW;
END `,
    },
  ];
  return specs.map((spec) => ({
    // to_regprocedure takes argument types only, not parameter names.
    signature: `${q(spec.name)}(${spec.args.replace(/^\w+ /, "")})`,
    body: spec.body,
    create: `CREATE OR REPLACE FUNCTION ${q(spec.name)}(${spec.args}) RETURNS ${spec.returns} ${spec.attributes} AS $$${spec.body}$$;`,
  }));
}

type PostgresPool = {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
};

async function catalogValue(pool: PostgresPool, sql: string, values: unknown[]) {
  const { rows } = await pool.query(sql, values);
  return rows[0]?.value as string | null | undefined;
}

/**
 * Installs the database guards on the Postgres adapter. Other adapters get a warning instead:
 * the guards are SQL and cannot be applied to them.
 */
async function installTypeIdDatabaseGuards(
  payload: Payload,
  guards: ReadonlyArray<TypeIdTableGuard>,
): Promise<void> {
  if (payload.db.name !== "postgres") {
    payload.logger.warn(
      `payload-typeid: database guards are only installed on PostgreSQL; the "${payload.db.name}" adapter keeps application-level rules only.`,
    );
    return;
  }

  const db = payload.db as unknown as {
    pool: PostgresPool;
    schemaName?: string;
    tableNameMap?: Map<string, string>;
  };
  const schema = db.schemaName;
  if (schema !== undefined && !identifierPattern.test(schema)) {
    throw new TypeError(`payload-typeid: unsupported PostgreSQL schema name "${schema}".`);
  }
  const q = qualifier(schema);
  const pool = db.pool;

  const tables = guards.map(({ slug, prefix }) => {
    const defaultName = tableNameForSlug(slug);
    return { slug, prefix, table: db.tableNameMap?.get(defaultName) ?? defaultName };
  });
  for (const { slug, prefix, table } of tables) {
    if (!identifierPattern.test(table) || !prefixSafePattern.test(prefix)) {
      throw new TypeError(
        `payload-typeid: refusing to guard unsafe table "${table}" or prefix "${prefix}".`,
      );
    }
    const relation = await catalogValue(pool, "SELECT to_regclass($1)::text AS value", [q(table)]);
    if (!relation) {
      throw new TypeError(
        `payload-typeid: no table "${table}" for collection "${slug}". Set the collection's dbName or rename it before enabling TypeIDs.`,
      );
    }
  }

  // Only missing or differing objects are changed, so an up-to-date database needs no DDL and
  // a role without table-owner rights can still start.
  const statements: string[] = [];
  for (const spec of functionSpecs(q)) {
    const current = await catalogValue(
      pool,
      "SELECT prosrc AS value FROM pg_proc WHERE oid = to_regprocedure($1)",
      [spec.signature],
    );
    if (current !== spec.body) statements.push(spec.create);
  }

  for (const { prefix, table } of tables) {
    const constraint = `payload_typeid_${table}_id_check`;
    const trigger = `payload_typeid_${table}_guard`;
    const constraintDef = await catalogValue(
      pool,
      "SELECT pg_get_constraintdef(c.oid) AS value FROM pg_constraint c WHERE c.conrelid = to_regclass($1) AND c.conname = $2",
      [q(table), constraint],
    );
    if (!constraintDef?.includes(`'^${prefix}_[0-7][0-9a-hjkmnp-tv-z]{25}$'`)) {
      statements.push(
        `ALTER TABLE ${q(table)} DROP CONSTRAINT IF EXISTS "${constraint}";`,
        `ALTER TABLE ${q(table)} ADD CONSTRAINT "${constraint}" CHECK (id ~ '^${prefix}_[0-7][0-9a-hjkmnp-tv-z]{25}$');`,
      );
    }
    const triggerDef = await catalogValue(
      pool,
      "SELECT pg_get_triggerdef(t.oid) AS value FROM pg_trigger t WHERE t.tgrelid = to_regclass($1) AND t.tgname = $2 AND NOT t.tgisinternal",
      [q(table), trigger],
    );
    if (!triggerDef?.includes(`payload_typeid_guard('${prefix}')`)) {
      statements.push(
        `DROP TRIGGER IF EXISTS "${trigger}" ON ${q(table)};`,
        `CREATE TRIGGER "${trigger}" BEFORE INSERT OR UPDATE ON ${q(table)} FOR EACH ROW EXECUTE FUNCTION ${q("payload_typeid_guard")}('${prefix}');`,
      );
    }
  }

  if (statements.length > 0) {
    // A multi-statement query runs as one transaction: a failure leaves the previous guards in place.
    await pool.query(statements.join("\n"));
  }
}

export type TypeID<Prefix extends string = string> = string extends Prefix
  ? string
  : Prefix extends ""
    ? string
    : `${Prefix}_${string}`;

export interface TypeIdOptions {
  collections?: Record<string, boolean | string>;
}

interface ParsedTypeID<Prefix extends string = string> {
  prefix: Prefix;
  uuid: string;
}

const prefixPattern = /^([a-z]([a-z_]{0,61}[a-z])?)?$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const typeIdAlphabet = "0123456789abcdefghjkmnpqrstvwxyz";
const maxUuid = (1n << 128n) - 1n;

function validatePrefix(prefix: string): void {
  if (!prefixPattern.test(prefix)) {
    throw new TypeError(
      `Invalid TypeID prefix "${prefix}". Prefixes must be empty or 1–63 lowercase ASCII letters and underscores, starting and ending with a letter.`,
    );
  }
}

function uuidFromBytes(bytes: Uint8Array): string {
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function encodeUuid(uuid: string): string {
  let value = BigInt(`0x${uuid.replaceAll("-", "")}`);
  let suffix = "";
  for (let index = 0; index < 26; index += 1) {
    suffix = typeIdAlphabet[Number(value & 31n)] + suffix;
    value >>= 5n;
  }
  return suffix;
}

function decodeSuffix(suffix: string): string {
  let value = 0n;
  for (const character of suffix) {
    const digit = typeIdAlphabet.indexOf(character);
    if (digit === -1)
      throw new TypeError("Suffix contains a character outside the TypeID alphabet.");
    value = (value << 5n) | BigInt(digit);
  }
  if (value > maxUuid) throw new TypeError("Suffix exceeds the 128-bit UUID range.");
  return value.toString(16).padStart(32, "0");
}

export function fromUUID<const Prefix extends string>(
  prefix: Prefix,
  uuid: string,
): TypeID<Prefix> {
  validatePrefix(prefix);
  if (!uuidPattern.test(uuid)) {
    throw new TypeError(`Invalid UUID "${uuid}". Expected a canonical 36-character UUID.`);
  }
  return `${prefix ? `${prefix}_` : ""}${encodeUuid(uuid)}` as TypeID<Prefix>;
}

export function parseTypeId<const Prefix extends string = string>(
  value: string,
): ParsedTypeID<Prefix> {
  if (typeof value !== "string") throw new TypeError("TypeID must be a string.");
  const separator = value.lastIndexOf("_");
  const prefix = separator === -1 ? "" : value.slice(0, separator);
  const suffix = separator === -1 ? value : value.slice(separator + 1);
  try {
    validatePrefix(prefix);
    if (separator !== -1 && prefix === "") {
      throw new TypeError("An empty prefix must not include a separator.");
    }
    if (suffix.length !== 26) throw new TypeError("Suffix must contain exactly 26 characters.");
    const hex = decodeSuffix(suffix);
    return {
      prefix: prefix as Prefix,
      uuid: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
    };
  } catch (error) {
    throw new TypeError(
      `Invalid TypeID "${value}": ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

export function toUUID(value: string): string {
  return parseTypeId(value).uuid;
}

export function isTypeId<Prefix extends string = string>(
  value: unknown,
  expectedPrefix?: Prefix,
): value is TypeID<Prefix> {
  if (typeof value !== "string") return false;
  try {
    const parsed = parseTypeId(value);
    return expectedPrefix === undefined || parsed.prefix === expectedPrefix;
  } catch {
    return false;
  }
}

export function generateTypeId<const Prefix extends string>(prefix: Prefix): TypeID<Prefix> {
  validatePrefix(prefix);
  const bytes = randomBytes(16);
  let timestamp = BigInt(Date.now());
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(timestamp & 0xffn);
    timestamp >>= 8n;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return fromUUID(prefix, uuidFromBytes(bytes));
}

function deriveCollectionPrefix(slug: string): string {
  // Hyphens and underscores are word separators; Payload's formatLabels splits only on hyphens and whitespace.
  const singular = formatLabels(slug.replaceAll("_", "-")).singular;
  const words = singular.split(" ");
  // Acronyms such as "APIKeys" split into single letters, so they cannot be derived reliably.
  const derivable =
    singular !== "" &&
    words.every((word) => /^[A-Za-z]+$/.test(word)) &&
    !(words.length > 1 && words.some((word) => word.length === 1));
  if (!derivable) {
    throw new TypeError(
      `Collection "${slug}" cannot derive a TypeID prefix from its slug. Set custom.typeId or collections["${slug}"] to an explicit prefix string.`,
    );
  }
  return words.join("_").toLowerCase();
}

function hasCustomID(fields: Field[]): boolean {
  return flattenAllFields({ fields }).some((field) => "name" in field && field.name === "id");
}

function createIDField(prefix: string): Field {
  return {
    name: "id",
    type: "text",
    required: true,
    admin: { hidden: true, readOnly: true },
    access: {
      create: () => true,
      update: () => false,
    },
    defaultValue: () => generateTypeId(prefix),
    hooks: {
      beforeChange: [
        ({ operation, originalDoc, value }) => {
          if (operation === "create") return value || generateTypeId(prefix);
          return originalDoc?.id ?? value;
        },
      ],
      beforeDuplicate: [() => generateTypeId(prefix)],
    },
  };
}

function withIDOwnership(collection: CollectionConfig, prefix: string): CollectionConfig {
  const beforeOperation = collection.hooks?.beforeOperation ?? [];
  return {
    ...collection,
    // Payload stops custom ID discovery when it reaches structural fields.
    fields: [createIDField(prefix), ...collection.fields],
    hooks: {
      ...collection.hooks,
      beforeOperation: [
        ...beforeOperation,
        ({ operation, args }) => {
          if (operation === "create") {
            const createArgs = args as { customID?: unknown; data?: Record<string, unknown> };
            if (createArgs.customID !== undefined || createArgs.data?.id !== undefined) {
              throw new TypeError(
                `Collection "${collection.slug}" owns its IDs; omit customID and data.id when creating documents.`,
              );
            }
          }
          if (operation === "update") {
            const updateArgs = args as { data?: Record<string, unknown> };
            if (updateArgs.data?.id !== undefined) {
              throw new TypeError(
                `Collection "${collection.slug}" IDs are immutable; omit data.id when updating documents.`,
              );
            }
          }
          return args;
        },
      ],
    },
  };
}

function readSetting(value: unknown, owner: string): boolean | string | undefined {
  if (value === undefined || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  throw new TypeError(
    `Invalid TypeID configuration for ${owner}: custom.typeId must be true, false, a prefix string, or undefined.`,
  );
}

function assertCurrentKey(custom: Record<string, unknown> | undefined, owner: string): void {
  if (custom && Object.hasOwn(custom, "typeid")) {
    throw new TypeError(
      `${owner} uses the obsolete custom.typeid key; rename it to custom.typeId.`,
    );
  }
}

function validateCollectionPrefix(slug: string, prefix: string): void {
  if (prefix === "") {
    throw new TypeError(
      `Collection "${slug}" resolved to an empty TypeID prefix; provide a non-empty prefix string.`,
    );
  }
  try {
    validatePrefix(prefix);
  } catch (error) {
    throw new TypeError(
      `Invalid TypeID prefix for collection "${slug}": ${error instanceof Error ? error.message : String(error)} Provide a valid prefix string.`,
      { cause: error },
    );
  }
}

export function typeId(options: TypeIdOptions = {}): Plugin {
  const plugin: Plugin = (config: Config) => {
    if (typeof options !== "object" || options === null || Array.isArray(options)) {
      throw new TypeError("TypeID options must be an object.");
    }
    if (Object.keys(options).some((key) => key !== "collections")) {
      throw new TypeError('TypeID options only support "collections".');
    }
    if ((config.plugins?.filter(({ slug }) => slug === "payload-typeid").length ?? 0) > 1) {
      throw new TypeError("Register typeId() only once in the Payload plugins array.");
    }

    const overrides = options.collections;
    if (
      overrides !== undefined &&
      (typeof overrides !== "object" || overrides === null || Array.isArray(overrides))
    ) {
      throw new TypeError(
        "TypeID collections must be a record of collection slugs to true, false, or prefix strings.",
      );
    }
    for (const [slug, setting] of Object.entries(overrides ?? {})) {
      if (typeof setting !== "boolean" && typeof setting !== "string") {
        throw new TypeError(
          `TypeID collections["${slug}"] must be true, false, or a prefix string.`,
        );
      }
    }

    const collections = config.collections ?? [];
    const collectionSlugs = new Set(collections.map(({ slug }) => slug));
    for (const slug of Object.keys(overrides ?? {})) {
      if (!collectionSlugs.has(slug)) {
        throw new TypeError(`TypeID collections references unknown collection "${slug}".`);
      }
    }

    for (const global of config.globals ?? []) {
      assertCurrentKey(global.custom, `Global "${global.slug}"`);
      const setting = readSetting(global.custom?.typeId, `Global "${global.slug}"`);
      if (setting !== undefined && setting !== false) {
        throw new TypeError(
          `Global "${global.slug}" cannot use custom.typeId ${JSON.stringify(setting)} because Payload Globals do not expose configurable document IDs. Use false or omit custom.typeId.`,
        );
      }
    }

    // Resolve opt-out first so shadowed central settings never reach prefix validation.
    // Precedence: model custom.typeId > central collections entry > default (derived prefix).
    const managed: Array<{ collection: CollectionConfig; setting: true | string }> = [];
    for (const collection of collections) {
      assertCurrentKey(collection.custom, `Collection "${collection.slug}"`);
      const modelSetting = readSetting(
        collection.custom?.typeId,
        `collection "${collection.slug}"`,
      );
      const centralSetting =
        overrides && Object.hasOwn(overrides, collection.slug)
          ? overrides[collection.slug]
          : undefined;
      const setting = modelSetting ?? centralSetting ?? true;
      if (setting === false) continue;
      managed.push({ collection, setting });
    }

    const prefixes = new Map<string, string>();
    const replacements = new Map<string, CollectionConfig>();
    const guards: TypeIdTableGuard[] = [];
    for (const { collection, setting } of managed) {
      const prefix = setting === true ? deriveCollectionPrefix(collection.slug) : setting;
      validateCollectionPrefix(collection.slug, prefix);

      const existing = prefixes.get(prefix);
      if (existing) {
        throw new TypeError(
          `Collections "${existing}" and "${collection.slug}" resolve to duplicate TypeID prefix "${prefix}". Set an explicit prefix on one of them with custom.typeId or collections.`,
        );
      }
      prefixes.set(prefix, collection.slug);

      if (hasCustomID(collection.fields)) {
        throw new TypeError(
          `Collection "${collection.slug}" already has a collection-level field named "id". Set custom.typeId = false or rename that field before enabling TypeID.`,
        );
      }
      replacements.set(collection.slug, withIDOwnership(collection, prefix));
      guards.push({ slug: collection.slug, prefix });
    }

    const onInit = config.onInit;
    return {
      ...config,
      collections: collections.map((collection) => replacements.get(collection.slug) ?? collection),
      // Database guards run after Payload has created its tables, so the CHECK and triggers apply to them.
      onInit: async (payload) => {
        await onInit?.(payload);
        await installTypeIdDatabaseGuards(payload, guards);
      },
    };
  };

  plugin.slug = "payload-typeid";
  plugin.order = Number.MAX_SAFE_INTEGER;
  return plugin;
}
