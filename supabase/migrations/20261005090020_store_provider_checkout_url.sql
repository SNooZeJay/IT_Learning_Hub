-- 20261005090020_store_provider_checkout_url.sql
--
-- A learner who starts a payment, walks away, and comes back got a dead button.
--
-- The cause
-- --------
-- create-checkout stored PayMongo's `checkout_session_id` but threw away the
-- `checkout_url` that came with it. On a second attempt it found the pending
-- payment, saw a provider_checkout_id, and had nothing to send the learner back
-- to - PayMongo's checkout URLs are issued once and are not reconstructible
-- from an id with any confidence.
--
-- So the reuse path could only report "no checkout link", which is exactly what
-- the page showed: a button that reads "Enrol for PHP 1,500.00" and then says
-- the provider returned nothing. The pending payment was there the whole time.
--
-- The frontend had a branch for this case too, and it was unreachable:
-- checkout.service.ts throws on a missing checkoutUrl before the view can see
-- `reused`. Both layers needed fixing; only the service was in the way.
--
-- The fix
-- -------
-- Keep the URL we were given. It is the provider's own handle on the session and
-- re-using it is the correct behaviour - the session is live until paid,
-- expired, or cancelled, and PayMongo tells us which through the webhook.
--
-- Existing pending rows have no stored URL, so they are cancelled rather than
-- left as dead ends: a learner hitting one of those gets a fresh session instead
-- of a button that cannot work.

alter table public.payments
  add column if not exists provider_checkout_url text;

comment on column public.payments.provider_checkout_url is
  'PayMongo hosted checkout URL, kept so a learner who abandons a payment can return to the same session instead of being given a dead button. Null for rows created before this column existed; those are cancelled and reopened rather than reconstructed.';

-- The rows this fixes are exactly the ones that cannot be fixed: a URL that was
-- never stored cannot be recovered. Retiring them is honest - it lets the next
-- attempt create a fresh session - where leaving them pending makes every future
-- attempt a no-op.
update public.payments
   set status = 'cancelled',
       updated_at = now()
 where status = 'pending'
   and provider_checkout_url is null
   and provider_checkout_id is not null;

-- A pending payment with neither a provider session nor a URL never completed a
-- checkout at all. Those are dead on arrival too.
update public.payments
   set status = 'cancelled',
       updated_at = now()
 where status = 'pending'
   and provider_checkout_id is null;

-- A pending enrolment whose payment has just been cancelled must not keep
-- granting nothing while blocking a fresh attempt: the enrolment row is left
-- alone deliberately, because create-checkout reuses it, and a 'pending'
-- enrolment is what a paid course legitimately looks like before payment.
--
-- What this migration does NOT do is invent a URL. Reconstructing one from the
-- session id would be a guess about PayMongo's URL format, and a wrong guess
-- sends a learner to a 404 at the moment they are trying to pay.
