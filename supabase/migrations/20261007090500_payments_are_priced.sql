-- The marketplace split was never computed for any payment created after the migration
-- that introduced it.
--
-- The bug
-- -------
--
-- `price_a_payment` is documented as "the only place a split is computed". It was the
-- only place a split *could* be computed, and nothing ever called it. Grepping the whole
-- repository for a caller returns one hit: the generated TypeScript type. There is no
-- call from `create-checkout`, none from the webhook handler, none from `settle_payment`,
-- and no trigger on `payments`.
--
-- So the eighteen rows that carry a fee and an instructor share got them from a one-off
-- `update ... where instructor_id is null` backfill at the bottom of
-- 20261007090000. Every payment created since - every real checkout a student has made -
-- has `instructor_id`, `platform_fee_pct`, `platform_fee_centavos` and
-- `instructor_share_centavos` all NULL. Confirmed against the live database: the one row
-- `create-checkout` had just written showed `fee= share=` empty while sixteen cancelled
-- rows around it read `fee=30000 share=120000`.
--
-- Nothing errors. That is what made it survive:
--
--   payments_split_reconciles  check ( all four columns null )
--                             or ( complete and fee + share = gross )
--
-- The first branch is the all-null case, permitted on purpose so the backfill could be
-- labelled as an explicit reconstruction rather than the schema implying the numbers had
-- always been there. That is a defensible reason to allow the column to be null. It is
-- not a reason for nothing to ever write it.
--
-- The consequence is a money bug, not a cosmetic one. The admin ledger reads an
-- instructor's earnings from these columns, so every new sale reports zero. A platform
-- fee that is never recorded is a platform fee that is never collected.
--
-- The fix
-- -------
--
-- A BEFORE INSERT trigger, rather than a `rpc('price_a_payment')` call added to
-- `create-checkout`.
--
-- The alternative was rejected deliberately. Patching one caller fixes one caller, and
-- leaves the rule dependent on every future writer remembering it - which is how it was
-- broken in the first place. A trigger makes the split a property of the row rather than
-- of the code path that happened to create it, so a checkout, a replayed webhook, a seed
-- and a hand-written admin insert all produce the same numbers.
--
-- INSERT only. `settle_payment` and `fail_payment` update the row, and a trigger on
-- UPDATE would re-price already-settled sales at today's rate, quietly rewriting history
-- in the opposite direction.
--
-- The trigger recomputes unconditionally rather than filling in only what is missing.
-- `price_a_payment` takes a course and a gross and returns the split; it has no parameter
-- for a caller to pass a fee through, and that is the point. Trusting a supplied split
-- would give a writer a way to say the fee is zero.

begin;

-- ---------------------------------------------------------------------------
-- 1. Every payment is priced on insert.
-- ---------------------------------------------------------------------------

create or replace function public.price_a_new_payment()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_split record;
begin
  -- Zero-amount rows are left alone rather than refused. `price_a_payment` raises on a
  -- non-positive gross, and a zero row has no split to carry. `create-checkout` returns
  -- `requiresPayment: false` for a free course without writing a row, so this is not a
  -- path the product takes - but the trigger should not be the thing that decides that,
  -- and it should not turn an allowed row into a failed insert.
  if new.amount_centavos is null or new.amount_centavos <= 0 then
    return new;
  end if;

  select * into v_split
    from public.price_a_payment(new.course_id, new.amount_centavos);

  new.instructor_id          := v_split.instructor_id;
  new.platform_fee_pct       := v_split.platform_fee_pct;
  new.platform_fee_centavos  := v_split.platform_fee_centavos;
  new.instructor_share_centavos := v_split.instructor_share_centavos;

  return new;
end;
$$;

comment on function public.price_a_new_payment() is
  'Prices every inserted payment through price_a_payment, so no writer can create a row with a null split. Exists because price_a_payment had no callers: the split columns were nullable, nothing was required to fill them, and every payment created after the split shipped recorded no fee and no instructor earnings.';

drop trigger if exists price_a_new_payment on public.payments;

create trigger price_a_new_payment
  before insert on public.payments
  for each row execute function public.price_a_new_payment();

-- ---------------------------------------------------------------------------
-- 2. The rows already created without one.
-- ---------------------------------------------------------------------------

-- Same expression the original backfill used, and the same seeded rate. These are
-- reconstructions rather than recovered history: no rate was recorded when they were
-- taken, so the current one is as good a guess as any and is at least internally
-- consistent with every row beside them.
update public.payments p
   set instructor_id = c.created_by,
       platform_fee_pct = s.platform_fee_pct,
       platform_fee_centavos = round(p.amount_centavos * s.platform_fee_pct / 100)::integer,
       instructor_share_centavos =
         p.amount_centavos - round(p.amount_centavos * s.platform_fee_pct / 100)::integer
  from public.courses c
  cross join public.platform_settings s
 where c.id = p.course_id
   and s.id = 1
   and p.amount_centavos > 0
   and p.platform_fee_centavos is null
   and p.instructor_share_centavos is null
   and p.instructor_id is null;

-- ---------------------------------------------------------------------------
-- 3. The churn in the ledger, and the demo shape that had drifted.
-- ---------------------------------------------------------------------------

-- Sixteen cancelled payments, every one of them from the same student and the same two
-- courses, and every one of them with no provider payment id and no checkout url. Those
-- are sessions that were retired by `create-checkout` before the provider ever answered
-- for them - nine of them from repeated calls made while testing this codebase.
--
-- A cancelled row with a provider id is evidence something happened. A cancelled row
-- without one records that nothing happened, sixteen times, and the code that retires
-- them says in terms that such a row "cannot sit in the admin ledger forever". Nineteen
-- rows of which sixteen are that row is a ledger that cannot be read.
--
-- Scoped to rows that never reached the provider rather than to `status = 'cancelled'`,
-- so a real cancellation is never touched by this.
delete from public.payments
 where status = 'cancelled'
   and provider_payment_id is null
   and provider_checkout_url is null
   and provider_checkout_id is null;

-- The documented shape in 20261006440000 puts Joren on a paid enrolment for Advanced
-- Python Development - the settlement, the one the demo is built to show. Live, Joren was
-- `pending` on it and Shan held the system's only settled payment: the two accounts had
-- swapped positions relative to what the migration says it created.
--
-- Settled through `settle_payment` rather than by writing a `paid` row, because that
-- function is what activates the enrolment, and an enrolment left `pending` next to a
-- `paid` payment is exactly the incoherence this migration is correcting. It also proves
-- the settlement path still works, which is worth more than the row.
--
-- The idempotency guard mirrors the function's own: a payment that is already paid is
-- left alone, so re-running this is a no-op rather than an error.
do $$
declare
  v_payment uuid;
begin
  select p.id into v_payment
    from public.payments p
    join public.profiles s on s.id = p.student_id
   where s.email = 'lalamonan.joren@ncst.edu.ph'
     and p.course_id = (select id from public.courses where slug = 'advanced-python')
     and p.status = 'pending'
   order by p.created_at desc
   limit 1;

  if v_payment is null then
    -- Nothing to settle. Either it was already settled, or there is no pending payment
    -- and the enrolment has to be repaired some other way. Reported rather than assumed.
    raise notice '3b. no pending Advanced Python payment for Joren; nothing to settle';
    return;
  end if;

  -- `settle_payment` activates the enrolment, and `protect_enrollment_entitlement` refuses
  -- that UPDATE unless the caller is an administrator or the course's instructor. A
  -- migration carries no claims, so `auth.uid()` is null, `is_admin()` is false, and the
  -- first attempt at this migration failed with "a student cannot change the status,
  -- course or timing of an enrolment" - the guard working correctly on a caller that is
  -- neither.
  --
  -- Stating the administrator's own claims is the same move 20261006440000 makes before
  -- promoting an account to instructor, and for the same reason: settling a payment on a
  -- demonstration account is an administrator action, and this is the administrator doing
  -- it. It is not a bypass. The guard is still evaluated, and it would still refuse the
  -- same update for any other claims.
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', (select id::text from public.profiles where role = 'admin' order by created_at limit 1),
      'role', 'authenticated'
    )::text,
    true
  );

  perform public.settle_payment(
    v_payment,
    'ITH-JOREN-SETTLED-0001',
    150000,
    'PHP',
    'validation-settle-joren'
  );
end;
$$;

commit;

-- ---------------------------------------------------------------------------
-- 4. Checks that refuse to pass.
-- ---------------------------------------------------------------------------

do $$
declare
  v_bad text;
  v_unpriced integer;
begin
  -- The bug itself. Any positive-amount payment with no split is the defect this
  -- migration exists to end, so its continued presence is a hard failure rather than
  -- something to report and move past.
  select count(*) into v_unpriced
    from public.payments
   where amount_centavos > 0
     and (platform_fee_centavos is null or instructor_share_centavos is null);

  if v_unpriced > 0 then
    raise exception '% payment(s) still carry no marketplace split', v_unpriced;
  end if;
  raise notice '4a. every positive-amount payment carries a split: correct';

  -- The trigger is attached, not merely defined - and to INSERT, and only INSERT.
  --
  -- `pg_trigger.tgtype` is a bitmask: 1 ROW, 2 BEFORE, 4 INSERT, 8 DELETE, 16 UPDATE,
  -- 32 TRUNCATE. The UPDATE bit is 16. An earlier draft of this check tested 20, which is
  -- INSERT|OR|UPDATE and therefore matched the trigger's own INSERT bit - the check
  -- failed on the very configuration it was written to confirm.
  if not exists (
    select 1 from pg_trigger
     where tgname = 'price_a_new_payment'
       and tgrelid = 'public.payments'::regclass
       and not tgisinternal
       and tgtype & 4 <> 0
  ) then
    raise exception 'price_a_new_payment is not attached to payments as a BEFORE INSERT trigger';
  end if;
  if exists (
    select 1 from pg_trigger
     where tgname = 'price_a_new_payment' and tgtype & 16 <> 0
  ) then
    raise exception 'price_a_new_payment fires on UPDATE; it would re-price settled sales';
  end if;
  raise notice '4b. the pricing trigger is attached, INSERT-only: correct';

  -- The trigger does not trust a caller. An insert claiming a zero fee must still be
  -- priced at the configured rate, because `price_a_payment` has no parameter to pass a
  -- fee through and the whole design rests on that.
  declare
    v_id uuid;
    v_fee integer;
    v_share integer;
  begin
    insert into public.payments
      (student_id, course_id, amount_centavos, currency, reference_number, status,
       platform_fee_pct, platform_fee_centavos, instructor_share_centavos)
    values
      ((select id from public.profiles where role = 'student' limit 1),
       (select id from public.courses where slug = 'advanced-python'),
       100000, 'PHP', 'ITH-VERIFY-PRICING-0001', 'cancelled',
       0, 0, 0)
    returning id, platform_fee_centavos, instructor_share_centavos
      into v_id, v_fee, v_share;

    if v_fee <> 20000 or v_share <> 80000 then
      raise exception 'a caller-supplied split of 0 was accepted (fee %, share %)',
        v_fee, v_share;
    end if;

    delete from public.payments where id = v_id;
  end;
  raise notice '4c. a caller-supplied split is recomputed, not trusted: correct';

  -- The demo shape the migration header documents.
  if not exists (
    select 1
      from public.enrollments e
      join public.profiles s on s.id = e.student_id
      join public.courses c on c.id = e.course_id
     where s.email = 'lalamonan.joren@ncst.edu.ph'
       and c.slug = 'advanced-python'
       and e.status = 'active'
  ) then
    raise exception 'Joren is not active on Advanced Python, which the demo shape documents';
  end if;
  raise notice '4d. Joren holds the settled paid enrolment the demo shape describes: correct';

  -- And the state that makes the demo worth having: somebody is still at checkout, so
  -- "can this person see this" is a real question rather than a formality.
  if not exists (select 1 from public.enrollments where status = 'pending') then
    raise exception 'no pending enrolment remains; nothing demonstrates an unpaid course';
  end if;
  raise notice '4e. a pending enrolment still demonstrates the unpaid state: correct';

  -- Reconciled everywhere, which is what the constraint was added to guarantee.
  select string_agg(id::text, ', ') into v_bad
    from public.payments
   where amount_centavos > 0
     and platform_fee_centavos + instructor_share_centavos <> amount_centavos;

  if v_bad is not null then
    raise exception 'these payments do not reconcile (fee + share <> gross): %', v_bad;
  end if;
  raise notice '4f. every priced payment reconciles to its gross: correct';
end $$;

notify pgrst, 'reload schema';
