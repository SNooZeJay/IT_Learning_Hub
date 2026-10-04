# Deployment runbook

Everything here needs a human once, because it touches accounts and dashboards.
Everything else is automated from this point.

Ordered by what blocks what. Nothing after step 3 works until step 2 is done.

---

## 0. What already exists

| Piece               | Where                                     | State                       |
| ------------------- | ----------------------------------------- | --------------------------- |
| Vercel app          | https://it-learning-hub-three.vercel.app/ | deployed, Vite preset       |
| Supabase project    | `rfqhekvtmegjjsofqlse`                    | live, 11 tables, RLS on all |
| Database migrations | `supabase/migrations/`                    | 0001–0006 applied           |
| Edge functions      | `supabase/functions/`                     | written, **not deployed**   |

The frontend on Vercel is a static SPA. It talks to Supabase directly for data and
to Supabase Edge Functions for anything secret. **There is no separate Node
backend**, which is what makes the hosting free.

---

## 1. One-time CLI login

```bash
npx supabase@latest login
npx supabase@latest link --project-ref rfqhekvtmegjjsofqlse
```

`login` opens a browser. It is the only genuinely interactive step.

---

## 2. Secrets

These three must exist as Supabase secrets before any function is deployed. They
are **never** written to a repo file, a `.env`, or a commit.

```bash
npx supabase@latest secrets set PAYMONGO_SECRET_KEY=sk_test_...   # from PayMongo dashboard > API keys
npx supabase@latest secrets set PAYMONGO_WEBHOOK_SECRET=...       # the whsk_ value
npx supabase@latest secrets set GMAIL_USER=...                    # the Gmail address
npx supabase@latest secrets set GMAIL_APP_PASSWORD=...            # Google app password, spaces removed
npx supabase@latest secrets set APP_URL=https://it-learning-hub-three.vercel.app
npx supabase@latest secrets set APP_FROM_NAME="IT Learning Hub"
```

Two of these values were pasted into a chat transcript during development. **Rotate
both after the demo.** `whsk_...` and the Gmail app password are credentials, not
configuration.

Confirm without printing the values:

```bash
npx supabase@latest secrets list
```

---

## 3. Deploy the functions

```bash
npx supabase@latest functions deploy paymongo-webhook --no-verify-jwt
npx supabase@latest functions deploy create-checkout --no-verify-jwt
npx supabase@latest functions deploy send-email --no-verify-jwt
```

`--no-verify-jwt` on the webhook because PayMongo is the caller and has no Supabase
JWT. That is correct, and safe **because** the handler verifies PayMongo's own HMAC
signature before touching any state.

`create-checkout` verifies the Supabase JWT itself and must therefore **not** be
given `--no-verify-jwt`.

After deploying, the webhook URL is:

```
https://<project-ref>.supabase.co/functions/v1/paymongo-webhook
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

```bash
# Functions respond
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST https://<ref>.supabase.co/functions/v1/paymongo-webhook

# Expect 405, not 404 or 502. 405 means it is deployed and the route is live.
```

Then confirm the webhook actually settles a payment by completing a real ₱1 course
checkout end to end and checking that the payment row reaches `paid` and the
enrolment reaches `active`.

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
