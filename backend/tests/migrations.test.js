const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  classifyLegacyMigrationState,
  loadMigrations,
  stripOuterTransaction,
} = require('../scripts/migrate');

describe('Database migrations', () => {
  it('loads ordered migration scripts without treating the base dump or rollback as migrations', () => {
    const migrations = loadMigrations();
    const names = migrations.map((migration) => migration.name);
    assert.deepEqual(names, [...names].sort());
    assert.ok(names.includes('20261107010000_order_payment_inventory.sql'));
    assert.ok(names.includes('20261107020000_fix_order_source_triggers.sql'));
    assert.ok(names.every((name) => !name.includes('rollback') && !name.startsWith('dump-')));
    assert.ok(migrations.every((migration) => /^[a-f0-9]{64}$/.test(migration.checksum)));
  });

  it('strips only a migration file transaction wrapper', () => {
    const body = stripOuterTransaction(
      '-- migration\nBEGIN;\nDO $$ BEGIN\n  PERFORM 1;\nEND $$;\nCOMMIT;\n',
    );
    assert.equal(body.trim(), '-- migration\nDO $$ BEGIN\n  PERFORM 1;\nEND $$;');
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
