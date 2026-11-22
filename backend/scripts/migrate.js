require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', 'database', 'migrations');
const MIGRATION_PATTERN = /^(\d{14})_[a-z0-9_]+\.sql$/i;
const LEGACY_MIGRATION = '20261107010000_order_payment_inventory.sql';
const LEGACY_FIX_MIGRATION = '20261107020000_fix_order_source_triggers.sql';

function migrationChecksums(sql) {
  const normalizedSql = sql.replace(/\r\n?/g, '\n');
  return {
    checksum: crypto.createHash('sha256').update(normalizedSql).digest('hex'),
    rawChecksum: crypto.createHash('sha256').update(sql).digest('hex'),
  };
}

const LEGACY_CONSTRAINTS = [
  'chk_inventories_reserved_quantity',
  'uq_inventories_slot_product',
  'fk_order_items_slot_product',
  'chk_order_items_subtotal_matches',
  'chk_orders_expiration',
];
const LEGACY_INDEXES = [
  'uq_payments_one_pending_per_order',
  'uq_payments_one_success_per_order',
  'idx_orders_pending_expiration',
  'uq_inventory_reservations_active_order_item',
  'idx_inventory_reservations_inventory',
];
const LEGACY_FUNCTIONS = [
  'validate_inventory_capacity',
  'validate_order_item_source',
  'refresh_order_total',
  'require_nonempty_order',
  'enforce_order_status_transition',
  'resolve_order_reservations',
  'validate_inventory_reservation',
  'apply_inventory_reservation',
  'validate_payment_attempt',
  'apply_payment_result',
  'prevent_invalid_reserved_source_change',
  'validate_order_items_for_payment',
];
const LEGACY_TRIGGERS = [
  'trg_validate_inventory_capacity',
  'trg_validate_order_item_source',
  'trg_refresh_order_total',
  'trg_require_nonempty_order',
  'trg_require_nonempty_order_items',
  'trg_enforce_order_status_transition',
  'trg_resolve_order_reservations',
  'trg_validate_inventory_reservation',
  'trg_apply_inventory_reservation',
  'trg_validate_payment_attempt',
  'trg_apply_payment_result',
  'trg_prevent_invalid_slot_change',
  'trg_prevent_invalid_product_change',
  'trg_validate_order_total_before_paid',
];

function loadMigrations(directory = MIGRATIONS_DIR) {
  return fs.readdirSync(directory)
    .filter((name) => MIGRATION_PATTERN.test(name))
    .sort()
    .map((name) => {
      const match = name.match(MIGRATION_PATTERN);
      const sql = fs.readFileSync(path.join(directory, name), 'utf8');
      return {
        version: match[1],
        name,
        sql,
        ...migrationChecksums(sql),
      };
    });
}

function stripOuterTransaction(sql) {
  const lines = sql.split(/\r?\n/);
  const isContent = (line) => line.trim() !== '' && !line.trim().startsWith('--');
  const first = lines.findIndex(isContent);
  let last = lines.length - 1;
  while (last >= 0 && !isContent(lines[last])) last -= 1;

  if (first < 0 || lines[first].trim().toUpperCase() !== 'BEGIN;'
      || last <= first || lines[last].trim().toUpperCase() !== 'COMMIT;') {
    throw new Error('Migration files must start with BEGIN; and end with COMMIT;');
  }

  lines.splice(last, 1);
  lines.splice(first, 1);
  return lines.join('\n');
}

function classifyLegacyMigrationState(state) {
  const counts = [
    state.column_count,
    state.constraint_count,
    state.index_count,
    state.function_count,
    state.trigger_count,
  ];
  const expected = [3, LEGACY_CONSTRAINTS.length, LEGACY_INDEXES.length,
    LEGACY_FUNCTIONS.length, LEGACY_TRIGGERS.length];
  const tablePresent = state.reservation_table === true;

  if (!tablePresent && counts.every((count) => count === 0)) return 'absent';
  if (tablePresent && counts.every((count, index) => count === expected[index])) {
    return 'complete';
  }
  return 'partial';
}

async function assertBaseSchema(client) {
  const result = await client.query(`
    SELECT
      to_regclass('public.orders') IS NOT NULL AS orders,
      to_regclass('public.order_items') IS NOT NULL AS order_items,
      to_regclass('public.inventories') IS NOT NULL AS inventories,
      to_regclass('public.machine_slots') IS NOT NULL AS machine_slots,
      to_regclass('public.payments') IS NOT NULL AS payments
  `);
  const missing = Object.entries(result.rows[0])
    .filter(([, present]) => !present)
    .map(([name]) => name);

  if (missing.length) {
    throw new Error(
      `Base schema is missing (${missing.join(', ')}). Restore ` +
      'database/migrations/dump-FreshVend-202611011643.sql into an empty database first.',
    );
  }
}

async function inspectLegacyMigration(client) {
  const result = await client.query(`
    SELECT
      (SELECT count(*)::int
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND ((table_name = 'orders' AND column_name = 'expires_at')
           OR (table_name = 'order_items' AND column_name = 'slot_id')
           OR (table_name = 'inventories' AND column_name = 'reserved_quantity')
      )) AS column_count,
      to_regclass('public.inventory_reservations') IS NOT NULL AS reservation_table,
      (SELECT count(*)::int FROM pg_constraint
       WHERE connamespace = 'public'::regnamespace
         AND conname = ANY($1::text[])) AS constraint_count,
      (SELECT count(*)::int FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('i', 'I')
         AND c.relname = ANY($2::text[])) AS index_count,
      (SELECT count(*)::int FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = ANY($3::text[])) AS function_count,
      (SELECT count(*)::int FROM pg_trigger t
       WHERE NOT t.tgisinternal AND t.tgname = ANY($4::text[])) AS trigger_count
  `, [LEGACY_CONSTRAINTS, LEGACY_INDEXES, LEGACY_FUNCTIONS, LEGACY_TRIGGERS]);
  return classifyLegacyMigrationState(result.rows[0]);
}

async function readMigrationLedger(client) {
  const table = await client.query(
    "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS ledger_present",
  );
  if (!table.rows[0].ledger_present) return new Map();

  const result = await client.query(
    'SELECT version, name, checksum FROM public.schema_migrations ORDER BY version',
  );
  return new Map(result.rows.map((row) => [row.version, row]));
}

async function ensureMigrationLedger(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version text PRIMARY KEY,
      name text NOT NULL UNIQUE,
      checksum char(64) NOT NULL,
      applied_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function validateLedger(ledger, migrations) {
  const known = new Map(migrations.map((migration) => [migration.version, migration]));
  for (const [version, applied] of ledger) {
    const migration = known.get(version);
    if (!migration) {
      throw new Error(`Database has unknown migration ${version} (${applied.name}).`);
    }
    const appliedChecksum = applied.checksum.trim();
    if (migration.name !== applied.name
        || (migration.checksum !== appliedChecksum
          && migration.rawChecksum !== appliedChecksum)) {
      throw new Error(
        `Migration ${applied.name} differs from its recorded checksum. ` +
        'Do not edit an applied migration; create a new migration instead.',
      );
    }
  }
  if (ledger.has('20261107020000') && !ledger.has('20261107010000')) {
    throw new Error('Migration ledger is inconsistent: the order/inventory migration is missing.');
  }
}

async function recordMigration(client, migration) {
  await client.query(
    `INSERT INTO public.schema_migrations (version, name, checksum)
     VALUES ($1, $2, $3)`,
    [migration.version, migration.name, migration.checksum],
  );
}

async function applyMigration(client, migration) {
  const body = stripOuterTransaction(migration.sql);
  await client.query('BEGIN');
  try {
    await client.query(body);
    await recordMigration(client, migration);
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[Migration] Rollback failed:', rollbackError.message);
    }
    throw error;
  }
}

async function adoptLegacyMigration(client, migration) {
  await client.query('BEGIN');
  try {
    await recordMigration(client, migration);
    await client.query('COMMIT');
    console.log(`[Migration] Recorded existing schema as ${migration.name}`);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[Migration] Rollback failed:', rollbackError.message);
    }
    throw error;
  }
}

async function runMigrations(client, migrations) {
  await assertBaseSchema(client);
  await ensureMigrationLedger(client);

  let ledger = await readMigrationLedger(client);
  validateLedger(ledger, migrations);

  const legacyMigration = migrations.find((migration) => migration.name === LEGACY_MIGRATION);
  if (!legacyMigration) throw new Error(`Required migration ${LEGACY_MIGRATION} is missing.`);

  const legacyState = await inspectLegacyMigration(client);
  if (ledger.has(legacyMigration.version)) {
    if (legacyState !== 'complete') {
      throw new Error('Recorded order/inventory migration is incomplete in the database.');
    }
  } else if (legacyState === 'complete') {
    await adoptLegacyMigration(client, legacyMigration);
    ledger = await readMigrationLedger(client);
  } else if (legacyState === 'partial') {
    throw new Error(
      'Order/inventory schema is partially migrated without a ledger entry. ' +
      'Back up the database and reconcile it before running migrations.',
    );
  }

  for (const migration of migrations) {
    if (ledger.has(migration.version)) {
      console.log(`[Migration] Already applied: ${migration.name}`);
      continue;
    }

    if (migration.name === LEGACY_FIX_MIGRATION && !ledger.has(legacyMigration.version)) {
      throw new Error(`Cannot apply ${migration.name} before ${LEGACY_MIGRATION}.`);
    }

    console.log(`[Migration] Applying: ${migration.name}`);
    await applyMigration(client, migration);

    if (migration.name === LEGACY_MIGRATION
        && await inspectLegacyMigration(client) !== 'complete') {
      throw new Error(`Migration ${migration.name} completed without the expected schema.`);
    }

    ledger = await readMigrationLedger(client);
  }
}

async function showStatus(client, migrations) {
  await assertBaseSchema(client);
  const ledger = await readMigrationLedger(client);
  validateLedger(ledger, migrations);

  let legacyState = 'absent';
  if (!ledger.has('20261107010000')) {
    legacyState = await inspectLegacyMigration(client);
    if (legacyState === 'partial') {
      throw new Error('Order/inventory schema is partially migrated without a ledger entry.');
    }
  }

  for (const migration of migrations) {
    if (ledger.has(migration.version)) {
      console.log(`APPLIED  ${migration.name}`);
    } else if (migration.name === LEGACY_MIGRATION && legacyState === 'complete') {
      console.log(`PRESENT  ${migration.name} (not yet recorded; db:migrate will reconcile)`);
    } else {
      console.log(`PENDING  ${migration.name}`);
    }
  }
}

async function main(args = process.argv.slice(2)) {
  if (args.some((arg) => arg !== '--status') || args.length > 1) {
    throw new Error('Usage: node scripts/migrate.js [--status]');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Set it in the repository .env file.');
  }

  const migrations = loadMigrations();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  let lockAcquired = false;
  try {
    await client.query(
      "SELECT pg_advisory_lock(hashtextextended('freshvend:schema_migrations', 0))",
    );
    lockAcquired = true;

    if (args[0] === '--status') {
      await showStatus(client, migrations);
    } else {
      await runMigrations(client, migrations);
      console.log('[Migration] Database schema is up to date.');
    }
  } finally {
    if (lockAcquired) {
      try {
        await client.query(
          "SELECT pg_advisory_unlock(hashtextextended('freshvend:schema_migrations', 0))",
        );
      } catch (error) {
        console.error('[Migration] Could not release advisory lock:', error.message);
      }
    }
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[Migration] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  classifyLegacyMigrationState,
  loadMigrations,
  migrationChecksums,
  stripOuterTransaction,
  validateLedger,
};
