-- Marketplace revenue split, and the receipt record that makes it sendable once.
--
-- What this adds
-- --------------
-- 1. platform_settings. One row, one number: what share of every sale the platform
--    keeps. A single-row table rather than key/value because there is exactly one
--    setting to read, and a key/value table can be half-populated - a missing key
--    then reads as a zero fee rather than as the misconfiguration it is.
--
-- 2. The split, snapshotted onto payments at creation. `payments.amount_centavos`
--    stays the gross and stays the settlement authority; the fee and the instructor
--    share are stored next to it so a change to the rate tomorrow does not rewrite
--    what happened last week.
--
-- 3. payment_receipts. One row per payment, unique on payment_id, which is the
--    deduplication key for the receipt email. The same idea as payment_events.event_id:
--    the provider retries until it gets a 200, so a duplicate delivery is routine and
--    the fix is a constraint rather than a check.
--
-- 4. Two views. They sum the STORED columns and never re-apply the current rate.
--    That distinction is the whole point: recomputing from the live rate silently
--    restates historical earnings every time an administrator changes the setting.
--
-- Who the payee is
-- ---------------
-- `courses.created_by` is the single payee. `course_instructors` is a teaching
-- assignment list and is deliberately NOT consulted here: a course with three
-- assigned instructors has one seller, and earnings are never split among them. The
-- payee is snapshotted onto the payment rather than read live from the course, so
-- crediting a sale does not change if the course is later reassigned.
--
-- Free courses
-- -----------
-- A free course creates no payment at all, so it has no fee and no earnings row.
-- `payments.amount_centavos` carries a check of `> 0`, which is what makes "free
-- means no payment row" true in the schema rather than only in the Edge Function.
--
-- Access
-- ------
-- platform_settings is readable by every authenticated user because the checkout
-- page has to display the fee it will charge, and writable by administrators only.
-- The fee is recomputed server-side in `price_a_payment` rather than trusted from a
-- caller, so a client that posts its own fee number changes nothing.
--
-- payment_receipts is service_role only. Nothing in the browser writes or updates it,
-- and a receipt that could be fabricated from the client is not a receipt.

begin;

-- ---------------------------------------------------------------------------
-- The platform fee rate
-- ---------------------------------------------------------------------------

create table if not exists public.platform_settings (
  -- Pinned to a single row. `id = 1` is the only value the check allows, so a second
  -- insert fails rather than creating a row that a later read might prefer.
  id smallint primary key default 1 check (id = 1),
  platform_fee_pct numeric(5, 2) not null check (platform_fee_pct between 0 and 100),
  updated_at timestamptz not null default now(),
  -- Nullable: the seeded row predates any administrator, and a migration cannot
  -- honestly claim one.
  updated_by uuid references public.profiles (id) on delete set null
);

comment on table public.platform_settings is
  'One row. platform_fee_pct is the share of every gross payment the platform keeps; the remainder belongs to the instructor who owns the course. Read by the checkout page and by price_a_payment. Changing it affects payments created afterwards only - each payment stores the rate it was priced at.';

comment on column public.platform_settings.platform_fee_pct is
  'Percentage, not a fraction: 20.00 means 20%. Bounded at 0 and 100 so it cannot be configured to take more than the sale or invert the split.';

insert into public.platform_settings (id, platform_fee_pct)
values (1, 20.00)
on conflict (id) do nothing;

comment on column public.platform_settings.updated_by is
  'The administrator who last changed the rate, for the audit trail. Null on the seeded row.';

alter table public.platform_settings enable row level security;

-- Every signed-in user may read the rate: the checkout page shows the fee it is about
-- to charge, and a student cannot be asked to agree to a number they are not allowed
-- to see. No INSERT, UPDATE or DELETE policy exists at all, which means no role has a
-- path to writing a row through PostgREST regardless of what it holds.
drop policy if exists "platform_settings select" on public.platform_settings;
create policy "platform_settings select" on public.platform_settings
  for select to authenticated
  using (true);

-- No write policy. Administrators change the rate by calling admin_set_platform_fee,
-- which records who did it; an unguarded UPDATE policy would let any row write its own
-- rate and skip the audit trail entirely.

revoke all on public.platform_settings from anon;
revoke all on public.platform_settings from public;
grant select on public.platform_settings to authenticated;
grant select on public.platform_settings to service_role;

-- ---------------------------------------------------------------------------
-- The split, stored on the payment
-- ---------------------------------------------------------------------------

alter table public.payments
  add column if not exists instructor_id uuid references public.profiles (id) on delete set null,
  add column if not exists platform_fee_pct numeric(5, 2),
  add column if not exists platform_fee_centavos integer,
  add column if not exists instructor_share_centavos integer;

comment on column public.payments.instructor_id is
  'The single payee, snapshotted from courses.created_by when the payment was created. Not course_instructors: a course has one seller however many instructors teach it. Null on rows created before this migration.';
comment on column public.payments.platform_fee_pct is
  'The rate this payment was priced at. A snapshot, so changing platform_settings later does not restate this sale.';
comment on column public.payments.platform_fee_centavos is
  'round(amount_centavos * platform_fee_pct / 100). The platform''s share of this sale.';
comment on column public.payments.instructor_share_centavos is
  'amount_centavos - platform_fee_centavos. What the instructor earned on this sale.';

create index if not exists payments_instructor_id_idx on public.payments (instructor_id);

-- The arithmetic is checked by the database, not trusted from the writer.
--
-- A constraint rather than application code because these three columns are what the
-- instructor and the platform are paid against. If they can drift from
-- amount_centavos the split silently stops reconciling to the money, and nothing above
-- this layer would notice.
--
-- POSITIVE FORM. A CHECK passes a row when its expression evaluates to TRUE, so this
-- states what a valid split IS, not what an invalid one looks like. The first attempt
-- at this constraint listed the failure conditions and OR'd them, which is the
-- opposite polarity: it accepted every row whose arithmetic was wrong and rejected
-- every correct one. It failed on the first backfill row with
--
--     amount_centavos 150000, platform_fee_centavos 30000, instructor_share_centavos 120000
--
-- which is a correct 20/80 split of 1500.00 pesos. The numbers were right and the
-- boolean was backwards.
--
-- The two valid shapes, and nothing else:
--
--   1. No snapshot at all. All three NULL: a payment created before this migration,
--      which the backfill below fills in. Mixed NULLs are NOT allowed - a half-filled
--      split is the state this constraint exists to prevent.
--   2. A complete snapshot that reconciles: rate in range, both amounts
--      non-negative, and fee + share exactly equal to the gross.
-- The split must be read-only to the browser at the GRANT layer, not merely protected
-- by the absence of an UPDATE policy.
--
-- Supabase grants ALL on tables in public to anon and authenticated by default, so
-- `payments` has always carried INSERT and UPDATE for authenticated. RLS is what
-- actually stopped the write: there is no UPDATE policy, so every attempt matches no
-- row. That is the enforcement the project relies on everywhere else, and it is
-- sufficient on its own.
--
-- But the split columns are the numbers an instructor and the platform get paid
-- against, and "no policy happens to cover it" is a weaker statement than "no
-- privilege exists". Four columns are revoked by name below so that adding a broad
-- payments UPDATE policy later cannot silently make them writable. DELETE is
-- deliberately left alone: `payments admin delete` is an existing, intended policy.
--
-- Nothing in the application updates a payment from the browser. settlement is
-- settle_payment and fail_payment, both SECURITY DEFINER and service_role only.
revoke insert, update on public.payments from anon;
revoke insert, update on public.payments from authenticated;

alter table public.payments
  drop constraint if exists payments_split_reconciles;

alter table public.payments
  add constraint payments_split_reconciles
  check (
    (
      platform_fee_pct is null
      and platform_fee_centavos is null
      and instructor_share_centavos is null
    )
    or (
      platform_fee_pct between 0 and 100
      and platform_fee_centavos is not null
      and platform_fee_centavos >= 0
      and instructor_share_centavos is not null
      and instructor_share_centavos >= 0
      and platform_fee_centavos + instructor_share_centavos = amount_centavos
    )
  );

comment on constraint payments_split_reconciles on public.payments is
  'Fee plus instructor share must equal the gross exactly. Half a peso of unaccounted money on a payment row is a bug in the split, and this is where it stops.';

-- Backfill existing rows at the seeded rate.
--
-- These payments were taken before a rate existed, so there is no historical figure to
-- recover and 20% is as good a reconstruction as any. Recorded here rather than
-- silently skipped because the alternative is an instructor whose existing sales read
-- as zero earnings forever. The snapshot columns are nullable precisely so this can be
-- done explicitly and labelled, instead of the schema implying these numbers were
-- always present.
update public.payments p
   set instructor_id = c.created_by,
       platform_fee_pct = (select platform_fee_pct from public.platform_settings where id = 1),
       platform_fee_centavos = round(p.amount_centavos * (select platform_fee_pct from public.platform_settings where id = 1) / 100)::integer,
       instructor_share_centavos =
         p.amount_centavos - round(p.amount_centavos * (select platform_fee_pct from public.platform_settings where id = 1) / 100)::integer
  from public.courses c
 where c.id = p.course_id
   and p.instructor_id is null;

-- ---------------------------------------------------------------------------
-- price_a_payment: the only place a split is computed
-- ---------------------------------------------------------------------------

create or replace function public.price_a_payment(
  in_course_id uuid,
  in_gross_centavos integer
)
returns table (
  instructor_id uuid,
  platform_fee_pct numeric,
  platform_fee_centavos integer,
  instructor_share_centavos integer
)
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $$
declare
  v_owner uuid;
  v_pct numeric(5, 2);
begin
  if in_gross_centavos is null or in_gross_centavos <= 0 then
    raise exception 'a payment must be for a positive amount, got %', in_gross_centavos
      using errcode = 'check_violation';
  end if;

  -- The seller is the course owner. course_instructors is not consulted, by design.
  select c.created_by into v_owner from public.courses c where c.id = in_course_id;
  if v_owner is null then
    raise exception 'course % does not exist or has no owner', in_course_id
      using errcode = 'no_data_found';
  end if;

  select s.platform_fee_pct into v_pct from public.platform_settings s where s.id = 1;
  if v_pct is null then
    -- A missing row is not a zero fee. Treating it as one would hand the platform
    -- nothing and look correct.
    raise exception 'platform_settings has no row; the platform fee cannot be priced'
      using errcode = 'no_data_found';
  end if;

  return query
  select
    v_owner,
    v_pct,
    round(in_gross_centavos * v_pct / 100)::integer,
    (in_gross_centavos - round(in_gross_centavos * v_pct / 100)::integer)::integer;
end;
$$;

comment on function public.price_a_payment(uuid, integer) is
  'Computes the marketplace split for one sale: the single payee (courses.created_by), the platform fee and the instructor share. Stable and SECURITY DEFINER so the rate and the owner are read once, server-side. Callers pass a gross amount and receive the four snapshot columns; they cannot pass a fee, because there is no parameter to pass one to.';

revoke all on function public.price_a_payment(uuid, integer) from anon;
revoke all on function public.price_a_payment(uuid, integer) from public;
grant execute on function public.price_a_payment(uuid, integer) to service_role;

-- The checkout page needs the same numbers before any payment exists, so it may call
-- this with a course id and a gross it has already read. It is read-only, so
-- authenticated callers holding it can price a sale and nothing more.
grant execute on function public.price_a_payment(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Administrator changes the rate
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_platform_fee(in_platform_fee_pct numeric)
returns public.platform_settings
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_row public.platform_settings%rowtype;
begin
  if not public.is_admin() then
    raise exception 'only an administrator may change the platform fee'
      using errcode = '42501';
  end if;

  if in_platform_fee_pct is null
     or in_platform_fee_pct < 0
     or in_platform_fee_pct > 100 then
    raise exception 'platform fee must be between 0 and 100, got %', in_platform_fee_pct
      using errcode = 'check_violation';
  end if;

  update public.platform_settings
     set platform_fee_pct = in_platform_fee_pct,
         updated_by = auth.uid(),
         updated_at = now()
   where id = 1
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.admin_set_platform_fee(numeric) is
  'Sets the platform fee and records who set it. Does not touch existing payments: each one carries the rate it was priced at, so changing this affects sales created afterwards and leaves the ledger intact.';

revoke all on function public.admin_set_platform_fee(numeric) from anon;
revoke all on function public.admin_set_platform_fee(numeric) from public;
grant execute on function public.admin_set_platform_fee(numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Receipts
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.payment_receipt_status as enum ('pending', 'sent', 'failed');
exception when duplicate_object then null; end $$;

comment on type public.payment_receipt_status is
  '''pending'' claimed but not yet sent, ''sent'' delivered, ''failed'' the send was attempted and refused. A row is created only after the payment is verified, so ''pending'' means a receipt is owed.';

create table if not exists public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  -- UNIQUE is the deduplication mechanism for the whole receipt feature.
  --
  -- PayMongo redelivers a webhook until it receives a 200, so the same paid event
  -- arrives more than once and a second email to a paying student is a real failure,
  -- not a cosmetic one. The constraint makes the second claim impossible: the insert
  -- matches no row and the sender knows not to send.
  payment_id uuid not null unique references public.payments (id) on delete cascade,
  recipient text not null check (length(btrim(recipient)) > 0),
  status public.payment_receipt_status not null default 'pending',
  sent_at timestamptz,
  -- Why the send failed, kept because a receipt stuck in 'failed' is invisible
  -- otherwise and a student who never received theirs has no way to tell.
  failure_reason text,
  created_at timestamptz not null default now()
);

comment on table public.payment_receipts is
  'One row per settled payment. Created only after settlement is verified, never when a checkout is opened. The unique payment_id is what stops a redelivered webhook sending a second receipt.';

comment on column public.payment_receipts.recipient is
  'The address the receipt went to, recorded so a later support question is answerable from the row rather than by guessing which of a student''s addresses was current at the time.';

create index if not exists payment_receipts_status_idx on public.payment_receipts (status);

alter table public.payment_receipts enable row level security;

-- No policies at all. RLS enabled with no policy denies every non-superuser role,
-- and the service role bypasses it by design, so the only writer is the settlement
-- path. A readable policy here would put a receipt table in front of signed-in users,
-- and a writable one would let anyone fabricate one.
revoke all on public.payment_receipts from anon;
revoke all on public.payment_receipts from public;
revoke all on public.payment_receipts from authenticated;
grant all on public.payment_receipts to service_role;

-- ---------------------------------------------------------------------------
-- Claiming a receipt
-- ---------------------------------------------------------------------------

create or replace function public.claim_payment_receipt(
  in_payment_id uuid,
  in_recipient text
)
returns table (payment_id uuid, status public.payment_receipt_status, already_claimed boolean)
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_existing public.payment_receipts%rowtype;
begin
  if in_payment_id is null then
    return query select null::uuid, null::public.payment_receipt_status, false;
    return;
  end if;

  -- Claim first and send afterwards.
  --
  -- Claiming before the send is what makes this safe under concurrency: two
  -- deliveries of the same event cannot both decide they are first. The claim is the
  -- unique constraint doing the work, and the sender only mails when `already_claimed`
  -- is false. Sending first and recording afterwards would race, and a student gets
  -- two receipts.
  insert into public.payment_receipts (payment_id, recipient, status)
  values (in_payment_id, btrim(in_recipient), 'pending')
  on conflict (payment_id) do nothing
  returning public.payment_receipts.payment_id,
            public.payment_receipts.status,
            false
    into v_existing;

  if found then
    return query
      select v_existing.payment_id, v_existing.status, false;
    return;
  end if;

  -- Someone already holds the claim for this payment.
  select r.payment_id, r.status, true
    into v_existing
    from public.payment_receipts r
   where r.payment_id = in_payment_id;

  return query
    select v_existing.payment_id, v_existing.status, true;
end;
$$;

comment on function public.claim_payment_receipt(uuid, text) is
  'Claims the right to send the receipt for one payment. Returns already_claimed = false only to the first caller, which is the one that should send. A redelivered webhook gets true and sends nothing.';

revoke all on function public.claim_payment_receipt(uuid, text) from anon;
revoke all on function public.claim_payment_receipt(uuid, text) from public;
revoke all on function public.claim_payment_receipt(uuid, text) from authenticated;
grant execute on function public.claim_payment_receipt(uuid, text) to service_role;

create or replace function public.mark_payment_receipt_sent(in_payment_id uuid)
returns void
language plpgsql
security definer
set search_path to public, pg_temp
as $$
begin
  update public.payment_receipts
     set status = 'sent', sent_at = now(), failure_reason = null
   where payment_id = in_payment_id
     and status <> 'sent';
end;
$$;

comment on function public.mark_payment_receipt_sent(uuid) is
  'Records that the receipt was accepted by the mail server. The sent_at guard means calling this twice is harmless and does not move the timestamp of the delivery that actually happened.';

revoke all on function public.mark_payment_receipt_sent(uuid) from anon;
revoke all on function public.mark_payment_receipt_sent(uuid) from public;
revoke all on function public.mark_payment_receipt_sent(uuid) from authenticated;
grant execute on function public.mark_payment_receipt_sent(uuid) to service_role;

create or replace function public.mark_payment_receipt_failed(
  in_payment_id uuid,
  in_reason text
)
returns void
language plpgsql
security definer
set search_path to public, pg_temp
as $$
begin
  -- Deliberately does not clear the claim. A failed send leaves the row 'failed' so
  -- an operator can see a receipt is owed; letting a retry overwrite the reason would
  -- make the first failure invisible.
  update public.payment_receipts
     set status = 'failed',
         failure_reason = left(coalesce(in_reason, 'unknown'), 500)
   where payment_id = in_payment_id
     and status = 'pending';
end;
$$;

comment on function public.mark_payment_receipt_failed(uuid, text) is
  'Records that a receipt could not be sent, with the reason. Only transitions from pending, so a receipt already delivered is never demoted to failed by a late error report.';

revoke all on function public.mark_payment_receipt_failed(uuid, text) from anon;
revoke all on function public.mark_payment_receipt_failed(uuid, text) from public;
revoke all on function public.mark_payment_receipt_failed(uuid, text) from authenticated;
grant execute on function public.mark_payment_receipt_failed(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- `security_invoker = true` so the view runs with the CALLER's privileges and the
-- payments policy still applies. Without it a view is owned by the migration role and
-- bypasses RLS, which would hand every authenticated user every instructor's earnings
-- and the platform's revenue - the exact leak this feature could introduce.
create or replace view public.instructor_earnings
with (security_invoker = true)
as
select
  p.instructor_id,
  pr.full_name,
  count(*)::integer                                      as sales_count,
  coalesce(sum(p.amount_centavos), 0)::bigint             as gross_centavos,
  coalesce(sum(p.instructor_share_centavos), 0)::bigint   as earnings_centavos,
  coalesce(sum(p.platform_fee_centavos), 0)::bigint       as platform_fee_centavos,
  min(p.paid_at)                                         as first_sale_at,
  max(p.paid_at)                                         as last_sale_at
from public.payments p
join public.profiles pr on pr.id = p.instructor_id
where p.status = 'paid'
  and p.instructor_id is not null
  and p.instructor_share_centavos is not null
group by p.instructor_id, pr.full_name;

comment on view public.instructor_earnings is
  'What each instructor has earned from settled sales, summed from the split stored on the payment. Never re-applies the current platform fee, so changing the rate does not restate history. Unpaid, cancelled and failed payments are excluded: only money that settled is earnings.';

create or replace view public.platform_revenue
with (security_invoker = true)
as
select
  coalesce(sum(p.platform_fee_centavos), 0)::bigint as platform_fee_centavos,
  coalesce(sum(p.amount_centavos), 0)::bigint       as gross_centavos,
  coalesce(sum(p.instructor_share_centavos), 0)::bigint as instructor_share_centavos,
  count(*)::integer                                as settled_count,
  min(p.paid_at)                                   as first_sale_at,
  max(p.paid_at)                                   as last_sale_at
from public.payments p
where p.status = 'paid'
  and p.platform_fee_centavos is not null;

comment on view public.platform_revenue is
  'The platform''s retained revenue, summed from the fee stored on each settled payment. Never recomputed from platform_settings, so a rate change is prospective only. Rows predating the split are excluded rather than counted as a zero fee, because a payment with no snapshot has no recorded platform share.';

-- -----------------------------------------------------------------------------
-- Assert the invariants, so a change that breaks one fails here instead of quietly.
-- -----------------------------------------------------------------------------

do $$
declare
  v_bad integer;
begin
  -- The fee and the share must reconstruct the gross, on every row that has a split.
  select count(*) into v_bad
    from public.payments
   where platform_fee_centavos is not null
     and instructor_share_centavos is not null
     and platform_fee_centavos + instructor_share_centavos <> amount_centavos;
  if v_bad > 0 then
    raise exception '% payment(s) have a split that does not reconcile to the gross', v_bad;
  end if;

  -- The seeded rate must exist, or price_a_payment raises and no sale can be priced.
  if not exists (select 1 from public.platform_settings where id = 1) then
    raise exception 'platform_settings row 1 is missing';
  end if;

  -- Every payment that has a split must also name its payee, or the earnings view
  -- drops the sale and the money appears to belong to nobody.
  select count(*) into v_bad
    from public.payments
   where instructor_share_centavos is not null
     and instructor_id is null;
  if v_bad > 0 then
    raise exception '% payment(s) carry a split but no instructor_id', v_bad;
  end if;

  -- The payee must be the course owner. course_instructors is not the answer to this
  -- question, and an earnings row attributed to a co-teacher is a wrong payout.
  select count(*) into v_bad
    from public.payments p
    join public.courses c on c.id = p.course_id
   where p.instructor_id is not null
     and p.instructor_id <> c.created_by;
  if v_bad > 0 then
    raise exception '% payment(s) name a payee who is not the course owner', v_bad;
  end if;

  -- A payment must be for a positive amount. This is what makes a free course
  -- genuinely skip payment rather than create a zero-value sale.
  if exists (select 1 from public.payments where amount_centavos <= 0) then
    raise exception 'a payment exists for a non-positive amount';
  end if;

  -- anon must hold nothing on the money, at the GRANT layer and not merely by policy.
  if has_table_privilege('anon', 'public.platform_settings', 'SELECT') then
    raise exception 'anon must not hold SELECT on platform_settings';
  end if;
  if has_table_privilege('anon', 'public.payment_receipts', 'SELECT') then
    raise exception 'anon must not hold SELECT on payment_receipts';
  end if;
  -- A signed-in user must not be able to read or fabricate a receipt.
  if has_table_privilege('authenticated', 'public.payment_receipts', 'SELECT')
     or has_table_privilege('authenticated', 'public.payment_receipts', 'INSERT') then
    raise exception 'authenticated must not hold privileges on payment_receipts';
  end if;
  -- And the split must not be client-writable. payments grants SELECT only, so these
  -- columns are read-only to the browser regardless of what a client sends.
  if has_column_privilege('authenticated', 'public.payments', 'platform_fee_centavos', 'UPDATE')
     or has_column_privilege('authenticated', 'public.payments', 'instructor_share_centavos', 'UPDATE')
     or has_column_privilege('authenticated', 'public.payments', 'instructor_id', 'UPDATE') then
    raise exception 'authenticated must not be able to UPDATE the split on payments';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
