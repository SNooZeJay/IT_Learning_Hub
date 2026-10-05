-- ============================================================================
-- 0003 - enum additions, split out on purpose
--
-- Postgres cannot use a value added by ALTER TYPE ... ADD VALUE inside the
-- same transaction that added it. Migration 0004 uses 'pending' and 'cancelled'
-- in function bodies and comparisons, so the values have to be committed first.
--
-- These run as their own statements and are safe to re-run.
-- ============================================================================

alter type public.enrollment_status add value if not exists 'pending';
alter type public.payment_status add value if not exists 'cancelled';

do $$ begin
  create type public.payment_event_status as enum ('received', 'processed', 'ignored', 'failed');
exception when duplicate_object then null; end $$;
