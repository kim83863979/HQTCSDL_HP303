# FreshVend 50-slot migration: staging runbook

This runbook does not connect to a database or run a migration by itself. Use it
only after a separate PostgreSQL staging instance/database has been provisioned
and its identity confirmed. Never point these steps at the production/active
`FreshVend` database.

## 1. Configure an isolated process connection

Have the staging URI injected by the approved secret manager as
`FRESHVEND_STAGING_DATABASE_URL`. Do not paste it into a command, terminal log,
ticket, or chat. In a fresh PowerShell session:

```powershell
if ([string]::IsNullOrWhiteSpace($env:FRESHVEND_STAGING_DATABASE_URL)) {
  throw 'Staging connection secret is not configured.'
}
$env:DATABASE_URL = $env:FRESHVEND_STAGING_DATABASE_URL
```

The migration runner calls dotenv without overriding existing process
environment values, so this process-scoped `DATABASE_URL` takes precedence
over the repository `.env`. Do not run the next steps unless the identity query
matches the staging host and database approved for this test and differs from
the active `FreshVend` target.

```powershell
psql "$env:DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "SELECT current_database(), current_user, inet_server_addr(), inet_server_port();"
```

## 2. Snapshot and preconditions

Capture the complete read-only snapshot before migration. Keep its output
securely with the staging change record; it includes product and inventory IDs.

```powershell
psql "$env:DATABASE_URL" -X -v ON_ERROR_STOP=1 -f docs/runbooks/50-slot-staging-snapshot.sql
npm --prefix backend run db:migrate:status
```

Proceed only if all of these hold:

- The identity still matches staging, not the active `FreshVend` database.
- Baseline tables and earlier migrations are present; the 50-slot migration is
  `PENDING`.
- `uq_machine_slot` is `UNIQUE (machine_id, slot_code)` and there are no
  duplicate machine/slot-code pairs.
- A staging backup has been created and a restore into another disposable
  database has already succeeded.
- The before-snapshot has been retained so existing slot and inventory rows can
  be compared exactly.

## 3. Backup and restore rehearsal

Use a staging-only URI injected as `FRESHVEND_STAGING_DATABASE_URL`. Keep the
backup outside the repository with restricted access. Do not print or echo the
URI.

```powershell
pg_dump --format=custom --no-owner --file "D:\secure-backups\freshvend-staging-before-50-slots.dump" "$env:FRESHVEND_STAGING_DATABASE_URL"
pg_restore --list "D:\secure-backups\freshvend-staging-before-50-slots.dump" | Out-Null
```

Restore only into a newly provisioned disposable database with a distinct
connection secret such as `FRESHVEND_RESTORE_DATABASE_URL`:

```powershell
if ([string]::IsNullOrWhiteSpace($env:FRESHVEND_RESTORE_DATABASE_URL)) {
  throw 'Disposable restore database secret is not configured.'
}
pg_restore --exit-on-error --no-owner --dbname "$env:FRESHVEND_RESTORE_DATABASE_URL" "D:\secure-backups\freshvend-staging-before-50-slots.dump"
psql "$env:FRESHVEND_RESTORE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f docs/runbooks/50-slot-staging-snapshot.sql
```

Confirm the restore target identity before `pg_restore`; never restore over the
staging source or active database. Do not run `--clean` or `--create` against an
existing database.

## 4. Apply on staging only

Recheck the identity immediately before applying. Use the Backend migration
runner, not `psql -f` on the migration file:

```powershell
psql "$env:DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "SELECT current_database(), current_user, inet_server_addr(), inet_server_port();"
npm --prefix backend run db:migrate
npm --prefix backend run db:migrate:status
psql "$env:DATABASE_URL" -X -v ON_ERROR_STOP=1 -f docs/runbooks/50-slot-staging-snapshot.sql
```

Compare before/after snapshots. Confirm every machine has each code `A01` to
`A50` exactly once; new standard slots have capacity 20 and status `ACTIVE`;
old slot IDs and attributes are identical; inventory rows have not appeared for
new empty slots; both unique constraints remain; and the trigger/function are
present.

## 5. Test new-machine trigger and idempotency

Only on staging, run this disposable transaction after migration. The inserted
test machine and its trigger-created slots are rolled back at the end:

```sql
BEGIN;
DO $$
DECLARE
  test_machine_id uuid;
  test_machine_code text := 'T50' || txid_current()::text;
  slot_count integer;
BEGIN
  INSERT INTO public.machines
    (machine_code, machine_name, location_name, address, lifecycle_status,
     min_temperature, max_temperature, alert_delay_minutes)
  VALUES
    (test_machine_code, '50 slot trigger test', 'STAGING ONLY', 'STAGING ONLY',
     'ACTIVE', 2, 8, 5)
  RETURNING machine_id INTO test_machine_id;

  SELECT COUNT(*) INTO slot_count
  FROM public.machine_slots
  WHERE machine_id = test_machine_id
    AND slot_code ~ '^A(0[1-9]|[1-4][0-9]|50)$';

  IF slot_count <> 50 THEN
    RAISE EXCEPTION 'Expected 50 provisioned slots, got %', slot_count;
  END IF;

  IF EXISTS (SELECT 1 FROM public.inventories i
             JOIN public.machine_slots ms USING (slot_id)
             WHERE ms.machine_id = test_machine_id) THEN
    RAISE EXCEPTION 'Provisioning created inventory for empty slots';
  END IF;
END $$;
ROLLBACK;
```

The migration runner records an applied version/checksum and skips that SQL on
subsequent `db:migrate` runs. Confirm this by running `db:migrate:status` and,
if desired, `db:migrate` again on staging: it should report the migration as
already applied and the post-snapshot should remain unchanged. Do not edit the
migration ledger to force re-execution. The `ON CONFLICT` provisioning INSERT
is also safe to execute again on staging; if directly testing it, use a
transaction and `ROLLBACK`, then compare snapshots. The full migration itself
should be re-tested from a fresh pre-migration staging restore, not by editing
history.

## 6. Clear process-scoped secrets

```powershell
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:FRESHVEND_STAGING_DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:FRESHVEND_RESTORE_DATABASE_URL -ErrorAction SilentlyContinue
```

## 7. Production gate

Do not deploy until staging passes all comparisons, the backup restore
rehearsal succeeds, the release owner approves the production window, and the
production connection identity is independently confirmed. Production
migration requires the user's separate explicit confirmation.
