-- Fix: a persistent assignment stopped being followed correctly after a few days.
--
-- The monitoring engine analysed the window `started_at ?? created_at` -> now.
-- `resetAssignment` clears `started_at` at the end of every run, so from the
-- second run onward the window fell back to `created_at` — the day the
-- assignment was first made — and kept growing by a day per run. That both
-- mixed previous runs into the current one (every stop already "visited", so
-- the job auto-advanced straight to `arrived`, which in turn made `en_route`
-- unreachable and left `started_at` permanently NULL) and made each cron tick
-- steadily more expensive until monitoring could no longer keep up. Recreating
-- the assignment "fixed" it only because that reset `created_at`.
--
-- `run_started_at` gives every run its own anchor, independent of the driver's
-- status transitions. Additive, fd_-prefixed, idempotent.
--
-- Deliberately avoids the DELIMITER/stored-procedure form used by 007: the
-- bundled runner splits on `;` and cannot execute those, so 007 had to be
-- applied by hand. This runs with:
--   node scripts/run-migration.js migrations/008_persistent_run_anchor.sql

-- 1) Add the column only if it is missing (MySQL 8 has no ADD COLUMN IF NOT EXISTS).
SET @ddl := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'fd_assignments'
        AND COLUMN_NAME = 'run_started_at'
    ),
    'SELECT 1',
    'ALTER TABLE fd_assignments ADD COLUMN run_started_at DATETIME NULL'
  )
);

PREPARE fd_st FROM @ddl;

EXECUTE fd_st;

DEALLOCATE PREPARE fd_st;

-- 2) Backfill existing rows so they stop analysing from their creation date.
--    Best available anchor per row: the run actually started, else the last
--    reset event, else when it was assigned/created.
UPDATE fd_assignments a
SET a.run_started_at = COALESCE(
  a.started_at,
  (SELECT MAX(e.created_at) FROM fd_route_events e
    WHERE e.assignment_id = a.assignment_id AND e.type = 'run_reset'),
  a.assigned_at,
  a.created_at
)
WHERE a.run_started_at IS NULL;
