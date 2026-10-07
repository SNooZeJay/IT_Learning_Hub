comment on table public.sign_in_challenges is
  'One-time sign-in codes. code_hash is HMAC-SHA-256(challenge_id || code) keyed by the SIGNIN_OTP_SECRET environment secret, never an unkeyed digest: a six-digit code is brute-forceable offline. Service-role access only; no RLS policies, no client grants.';
