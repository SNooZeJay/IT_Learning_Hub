# Deployment runbook

Everything here needs a human once, because it touches accounts and dashboards.
Everything else is automated from this point.

Ordered by what blocks what. Nothing after step 3 works until step 2 is done.

---

## 0. What already exists

| Piece               | Where                                                | State                                   |
| ------------------- | ---------------------------------------------------- | --------------------------------------- |
| Vercel app          | https://it-learning-hub-three.vercel.app/            | deployed, env vars set, SPA fallback on |
| Supabase project    | `rfqhekvtmegjjsofqlse`                               | live, 28 tables, RLS on every one       |
| Database migrations | `supabase/migrations/`                               | 0001–0013 applied                       |
| Edge functions      | `supabase/functions/`                                | **all three deployed**                  |
| Vercel env vars     | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | set, All Environments                   |

The frontend on Vercel is a static SPA. It talks to Supabase directly for data and
to Supabase Edge Functions for anything secret. **There is no separate Node
backend**, which is what makes the hosting free.

---

## 1. The CLI is already linked — no login needed

```bash
npx supabase@latest db push --dry-run
```

This works today without an interactive login, because the project is already
linked (`supabase/.temp/project-ref` holds `rfqhekvtmegjjsofqlse`) and the CLI has
the database credentials from that link.

This was discovered by running it, after weeks of assuming a login was the
blocker. **`db push` and `functions deploy` both work.** If you ever hit an auth
error, `npx supabase@latest login` is the fallback.

---

## 2. Secrets

Two of these are still missing. Both are needed for the features they belong to;
everything else already works.

```bash
# Needed by create-checkout. From PayMongo > Developers > API Keys. sk_test_...
npx supabase@latest secrets set PAYMONGO_SECRET_KEY=sk_test_...

# Needed by paymongo-webhook. The whsk_ value from the same page.
npx supabase@latest secrets set PAYMONGO_WEBHOOK_SECRET=whsk_...

# Needed by send-email. Your Gmail address...
npx supabase@latest secrets set MAIL_FROM=you@gmail.com

# ...and its app password, which Google prints with spaces in groups of four.
npx supabase@latest secrets set GMAIL_APP_PASSWORD=xxxxxxxxxxxx

# Where a password reset link should return the user to.
npx supabase@latest secrets set SITE_URL=https://it-learning-hub-three.vercel.app
```

Secrets are **never** written to a repo file, a `.env`, or a commit. Confirm they
exist without printing them:

```bash
npx supabase@latest secrets list
```

> **Earlier versions of this runbook listed `GMAIL_USER`, `APP_URL` and
> `APP_FROM_NAME`.** None of those are read by any function. They were listed
> before `send-email` existed and were never corrected. The names above are the
> ones the code actually reads.

**Rotate after the demo.** The PayMongo webhook secret and the Gmail app password
were both pasted into a chat transcript during development. They are credentials,
not configuration.

---

## 3. Deploy the functions

```bash
npx supabase@latest functions deploy create-checkout
npx supabase@latest functions deploy send-email
npx supabase@latest functions deploy paymongo-webhook --no-verify-jwt
```

`--no-verify-jwt` on the webhook **only**, because PayMongo is the caller and has no
Supabase JWT. That is correct and safe **because** the handler verifies PayMongo's
own HMAC signature before touching any state.

`create-checkout` and `send-email` verify the Supabase JWT themselves, so they must
**not** be given `--no-verify-jwt`.

The webhook URL is:

```
https://rfqhekvtmegjjsofqlse.supabase.co/functions/v1/paymongo-webhook
```

---

## 4. Register the webhook in PayMongo

Dashboard -> Settings -> Webhooks -> Edit.

| Field        | Value                                                                    |
| ------------ | ------------------------------------------------------------------------ |
| Endpoint URL | `https://rfqhekvtmegjjsofqlse.supabase.co/functions/v1/paymongo-webhook` |
| Secret key   | the same `whsk_` value set in step 2                                     |

**Events - these three, and only these three exist for this flow:**

| Event                           | What it means                                    |
| ------------------------------- | ------------------------------------------------ |
| `checkout_session.payment.paid` | learner paid via GCash or PayMaya - the main one |
| `payment.paid`                  | a payment succeeded directly, outside a checkout |
| `payment.failed`                | declined, or the learner abandoned the payment   |

### Events that do NOT exist

Checked against PayMongo's published event reference rather than guessed:

- `checkout_session.payment.failed` - **not a PayMongo event.** The only Checkout
  Session event is `checkout_session.payment.paid`.
- `checkout_session.expired` - **does not exist.**
- `payment.refunded` - **not an event.** The refund event is `refund.succeeded`,
  and this project ignores it rather than acting on it.

`qr.expired` does exist but is irrelevant here: this project offers **GCash and
PayMaya only**, both of which resolve inside the checkout session. QR Ph was
considered and dropped because it is asynchronous - the learner scans a code and
pays later in their banking app - which would need a "waiting for payment" state
that a synchronous flow does not.

### Also set the payment methods

The methods a learner sees at checkout are controlled by which channels are enabled
on the merchant account, not by the webhook. In the PayMongo dashboard, open
**Settings -> Payment Channels** and enable GCash and PayMaya, disabling card and
QR Ph if they appear.

PayMongo retries a failed delivery up to 12 times, then marks the event failed and
stops. A webhook that is not deployed before your demo means a paid order that
silently never activates. Deploy first, then point the URL here, then use the
**Test Events** tab on the webhook page to confirm a real delivery lands.

---

## 5. Frontend environment on Vercel

Vercel → Project → Settings → Environment Variables:

| Name                            | Value                                      |
| ------------------------------- | ------------------------------------------ |
| `VITE_SUPABASE_URL`             | `https://rfqhekvtmegjjsofqlse.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the `sb_publishable_...` key               |

Only the **publishable** key goes here. It is designed to be public. The secret key
never reaches Vercel.

Then redeploy so the new variables are baked into the bundle.

---

## Verifying a deployment

**A green dashboard proves nothing.** Every check below reads the thing that
actually matters: the compiled bundle, or a response from the live function.

### The frontend is really connected

```bash
# Must print a 20-character project ref. "NOT FOUND" means VITE_SUPABASE_URL was
# never set on Vercel, or set without a redeploy afterwards.
curl -s https://it-learning-hub-three.vercel.app/ \
  | grep -o '/assets/index-[A-Za-z0-9_-]*\.js' \
  | head -1 \
  | xargs -I{} curl -s https://it-learning-hub-three.vercel.app{} \
  | grep -c 'supabase\.co'
```

### Deep links work

```bash
# 200, not 404. This is the SPA fallback in vercel.json. Without it only "/" works
# and a page refresh mid-demo lands on a dead page.
curl -s -o /dev/null -w '%{http_code}\n' https://it-learning-hub-three.vercel.app/courses
```

### Functions are live

```bash
# 401 means deployed AND enforcing auth. 404 means it was never deployed.
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY" -H 'Content-Type: application/json' \
  -d '{"courseId":"x"}' \
  https://rfqhekvtmegjjsofqlse.supabase.co/functions/v1/create-checkout

# 200 with verified:false means deployed AND rejecting a forged signature.
curl -s -X POST -H 'Content-Type: application/json' \
  -H 'paymongo-signature: te signature=forged' -d '{}' \
  https://rfqhekvtmegjjsofqlse.supabase.co/functions/v1/paymongo-webhook
```

### Mail

```bash
# 200 with delivered:true means the whole path worked: link minted, SMTP accepted.
# 502 means a secret is missing - check `secrets list`.
curl -s -X POST -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"action":"password_reset","email":"a-real-address@example.com"}' \
  https://rfqhekvtmegjjsofqlse.supabase.co/functions/v1/send-email
```

Finally, confirm the webhook actually settles a payment: complete a ₱1,500 GCash
checkout end to end in test mode and check that `payments.status` reaches `paid`
and `enrollments.status` reaches `active`. That is the one flow no status code can
confirm for you.

---

## Free tier limits worth knowing

| Service                 | Limit                  | What happens past it |
| ----------------------- | ---------------------- | -------------------- |
| Vercel                  | 100GB bandwidth/month  | page slows, then 429 |
| Supabase DB             | 500MB                  | writes rejected      |
| Supabase Edge Functions | 500k invocations/month | throttled            |
| Supabase Auth           | unlimited MAU on free  | —                    |

A school demo uses a tiny fraction of all of these. The one to watch is Edge
Function invocations, because the PayMongo webhook is called on every payment event
including retries.
