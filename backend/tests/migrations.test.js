const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  classifyLegacyMigrationState,
  loadMigrations,
  migrationChecksums,
  stripOuterTransaction,
  validateLedger,
} = require('../scripts/migrate');

describe('Database migrations', () => {
  it('loads ordered migration scripts without treating the base dump or rollback as migrations', () => {
    const migrations = loadMigrations();
    const names = migrations.map((migration) => migration.name);
    assert.deepEqual(names, [...names].sort());
    assert.ok(names.includes('20261107010000_order_payment_inventory.sql'));
    assert.ok(names.includes('20261107020000_fix_order_source_triggers.sql'));
    assert.ok(names.includes('20261115210000_dispense_mqtt_workflow.sql'));
    assert.ok(names.includes('20261120100000_add_guest_order_access.sql'));
    assert.ok(names.every((name) => !name.includes('rollback') && !name.startsWith('dump-')));
    assert.ok(migrations.every((migration) => /^[a-f0-9]{64}$/.test(migration.checksum)));
  });

  it('strips only a migration file transaction wrapper', () => {
    const body = stripOuterTransaction(
      '-- migration\nBEGIN;\nDO $$ BEGIN\n  PERFORM 1;\nEND $$;\nCOMMIT;\n',
    );
    assert.equal(body.trim(), '-- migration\nDO $$ BEGIN\n  PERFORM 1;\nEND $$;');
  });

  it('accepts either the raw or LF-normalized checksum recorded in the ledger', () => {
    const version = '20261201000000';
    const name = `${version}_checksum_probe.sql`;
    const lfSql = 'BEGIN;\nSELECT 1;\nCOMMIT;\n';
    const crlfSql = lfSql.replace(/\n/g, '\r\n');
    const crSql = lfSql.replace(/\n/g, '\r');
    const lfChecksums = migrationChecksums(lfSql);
    const crlfChecksums = migrationChecksums(crlfSql);
    const crChecksums = migrationChecksums(crSql);
    const migration = { version, name, ...crlfChecksums };

    assert.equal(lfChecksums.checksum, crlfChecksums.checksum);
    assert.equal(lfChecksums.checksum, crChecksums.checksum);
    assert.notEqual(lfChecksums.rawChecksum, crlfChecksums.rawChecksum);
    assert.doesNotThrow(() => validateLedger(
      new Map([[version, { name, checksum: crlfChecksums.rawChecksum }]]),
      [migration],
    ));
    assert.doesNotThrow(() => validateLedger(
      new Map([[version, { name, checksum: crChecksums.rawChecksum }]]),
      [{ version, name, ...crChecksums }],
    ));
    assert.doesNotThrow(() => validateLedger(
      new Map([[version, { name, checksum: lfChecksums.checksum }]]),
      [migration],
    ));
  });

  it('rejects SQL edits that match neither recorded newline representation', () => {
    const version = '20261201000000';
    const name = `${version}_checksum_probe.sql`;
    const appliedSql = 'BEGIN;\nSELECT 1;\nCOMMIT;\n';
    const editedSql = 'BEGIN;\nSELECT 2;\nCOMMIT;\n';
    const migration = { version, name, ...migrationChecksums(editedSql) };
    const ledger = new Map([[
      version,
      { name, checksum: migrationChecksums(appliedSql).checksum },
    ]]);

    assert.throws(() => validateLedger(ledger, [migration]), /differs from its recorded checksum/);
  });

  it('loads the product image migration with a valid transaction wrapper', () => {
    const migration = loadMigrations().find(
      (item) => item.name === '20261122100000_add_product_image_url.sql',
    );

    assert.ok(migration);
    assert.doesNotThrow(() => stripOuterTransaction(migration.sql));
    assert.match(migration.sql.trimStart(), /^BEGIN;/);
    assert.match(migration.sql.trimEnd(), /COMMIT;$/);
    assert.match(migration.sql, /ADD COLUMN IF NOT EXISTS image_url text/);
    assert.doesNotMatch(migration.sql, /\b(?:UPDATE|DELETE)\b/i);
  });

  it('distinguishes unapplied, complete, and partially applied legacy schema', () => {
    const absent = {
      column_count: 0,
      reservation_table: false,
      constraint_count: 0,
      index_count: 0,
      function_count: 0,
      trigger_count: 0,
    };
    const complete = {
      column_count: 3,
      reservation_table: true,
      constraint_count: 5,
      index_count: 5,
      function_count: 12,
      trigger_count: 14,
    };

    assert.equal(classifyLegacyMigrationState(absent), 'absent');
    assert.equal(classifyLegacyMigrationState(complete), 'complete');
    assert.equal(
      classifyLegacyMigrationState({ ...complete, trigger_count: 13 }),
      'partial',
    );
  });
});
