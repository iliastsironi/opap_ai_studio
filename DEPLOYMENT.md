# Going live

The app already deploys to Vercel on every push to `main`, and Supabase is the
real database — the August figures and every account live there now. So this is
not a list of things to switch on. It is the list of what is still wrong with a
system that is already running.

Ordered by what actually blocks what. Written 2026-10-15.

---

## 1. Dangerous — fix before anyone else uses it

### The Owner account has a known password

Three accounts exist from the demo seed, all with `password123`:

| Account | Role | |
|---|---|---|
| `owner@shiftledger.gr` | ORG_OWNER | **the account currently in daily use** |
| `manager@shiftledger.gr` | STORE_MANAGER | |
| `employee@shiftledger.gr` | EMPLOYEE | |

Anyone who has seen a demo of this app can sign into live cash records, approve
shifts, and read the P&L.

1. Create the real Owner account with a real email and a real password.
2. Sign in as it and confirm it reaches Αναφορές → Οικονομικό P&L.
3. Delete the three demo accounts, or at minimum change every password.

Do this before the real org details below, so there is a working way in if
something goes wrong.

### Delete the demo accounts, and the backdoor closes with them

Until 2026-10-15 the client decided who belonged to the demo organisation with
a substring test — `email.includes('opap.gr')`. Anyone able to register
`opap.gr@gmail.com`, `x@opap.gr.evil.com` or an address at OPAP's own domain was
placed into `org_opap_demo` as an EMPLOYEE, inside live financial records,
instead of getting a tenant of their own. It is now an exact match on the three
seeded addresses, pinned by `src/tests/tenant_isolation.test.ts`.

Deleting those three accounts retires the concept entirely: the check then
returns false for everyone and every new registration gets its own tenant, which
is the intended end state.

### The organisation record is a demo

```
id          org_opap_demo
trade_name  ShiftLedger OPAP Demo Store
vat_number  EL998877665
```

That name and ΑΦΜ print on the sidebar, on shift receipts and in the Excel
export the accountant receives. The `id` can stay — it is referenced by every
row in the database and renaming it would be a migration for no benefit. The
name and VAT are what people see:

```sql
UPDATE organizations
   SET trade_name = 'ΤΟ ΠΡΑΓΜΑΤΙΚΟ ΟΝΟΜΑ',
       legal_name = 'Η ΠΛΗΡΗΣ ΕΠΩΝΥΜΙΑ',
       vat_number = 'EL…'
 WHERE id = 'org_opap_demo';
```

---

## 2. Environment variables on Vercel

Eight. Three of them fail *silently* — the app looks fine and quietly does
nothing, which is worse than an error.

| Variable | Without it |
|---|---|
| `SUPABASE_URL` | invites, copilot and emails return 500 |
| `SUPABASE_SERVICE_ROLE_KEY` | same — **never expose this to the browser** |
| `VITE_SUPABASE_URL` | the app cannot start |
| `VITE_SUPABASE_ANON_KEY` | the app cannot start |
| `APP_URL` | invite links point somewhere wrong |
| `RESEND_API_KEY` | **silent** — emails are logged, never sent |
| `EMAIL_FROM` | **silent** — same |
| `CRON_SECRET` | **silent** — the λαχεία reminder stops running |
| `GEMINI_API_KEY` | AI Copilot fails |

`vercel.json` already schedules `/api/lottery-cancel-reminder` at `0 6 * * *`.
Vercel crons run in **UTC**, so that is 09:00 Athens in summer and 08:00 in
winter — fine for a morning nudge, worth knowing before someone wonders why it
lands an hour earlier in November.

**Test one real invite after deploying.** It is the single path that can report
success and do nothing at all.

---

## 3. Sign-up, if you are selling this

Checked 2026-10-15 against the project's own `/auth/v1/settings`.

**Only email sign-in is enabled.** Every OAuth provider — Google included — is
off. The Google button is wired and correct, and now hides itself unless the
project reports the provider as enabled, so turning it on in Supabase makes it
appear with no code change.

<details>
<summary>Turning Google on — nothing to change in this repo</summary>

**In Google Cloud Console** (console.cloud.google.com):

1. Pick or create a project, then **APIs & Services → OAuth consent screen**.
   External, fill in app name and support email, save. While it is in Testing
   only accounts you list can sign in — publish it when you want real
   customers.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID**,
   type **Web application**.
3. Under **Authorised redirect URIs** add exactly this, which is Supabase's
   callback and not your app's address:

   ```
   https://jjvrechcwxfcalitknhn.supabase.co/auth/v1/callback
   ```

4. Copy the **Client ID** and **Client secret**.

**In Supabase** (Authentication → Providers → Google):

5. Enable it, paste both values, save.
6. Then **Authentication → URL Configuration**: set **Site URL** to the
   production address, and list every origin that may sign in under **Redirect
   URLs** — the production domain, any custom domain, and `http://localhost:3000`
   for development. `loginWithGoogle` asks to return to the origin it started
   from, but Supabase only honours origins on that list.

The button appears by itself once step 5 is saved; the app asks the project
which providers are on.

Two things that bite here: the redirect URI in step 3 is Supabase's, not the
app's, and the consent screen stays invisible to anyone outside your test list
until it is published.
</details>

**Email confirmation is required** (`mailer_autoconfirm` is false), which is the
right setting. But Supabase's built-in mailer is rate-limited to a handful of
messages an hour and is explicitly not for production use. Selling to several
agencies means configuring **custom SMTP** in Supabase → Authentication →
Emails, or new owners will silently stop receiving their confirmation link.
`RESEND_API_KEY` covers the app's own invite and summary emails; it does not
cover Supabase's auth emails, which are a separate pipe.

**Self-service sign-up is open** (`disable_signup` is false). Anyone with an
email address can create an account, which gives them a brand-new organisation
of their own — correct for a platform, worth knowing if you expected sign-up to
be invitation-only.

---

## 4. Data that makes the figures true

Neither blocks going live. Both make the numbers wrong until done, and the
dashboard now shows a profitability percentage computed from them.

### Payroll — August understates costs by €6.170,89
€6.480,89 left the bank; €310 is recorded as salary. Every «Χέρι» reads
negative as a result. Needs a monthly salary for 11 people and real names for
the five «Χωρίς όνομα». Enter at Αναφορές → Οικονομικό P&L → Μισθοδοσία.

### 401070 commissions
The store reports a loss with **zero revenue** against €300.890 of VLT cash.
Enter at Αναφορές → Καταχώρηση Προμηθειών.

Until both are in, Δείκτης Κερδοφορίας is flattering the worst store.

---

## 5. Debt that bites at volume, not today

**Receipt photos are base64 in a TEXT column.** Every photo inflates its row
and every query that touches it. Harmless at 98 expenses; a problem at 10.000.
The fix is Supabase Storage with the row holding a path.

**Skew Protection is implemented but inert** — it needs Vercel Pro. Without it,
someone with the app open during a deploy can load a chunk that no longer
exists. `src/lib/deploymentAssetUrl.ts` is already wired for it; enabling the
plan is all that is left.

---

## 6. Verifying it still holds

Run after any migration, and before any release that touches access:

```bash
node supabase/scripts/test-rls.mjs     # 37 cases, real sessions, self-cleaning
node supabase/scripts/verify-schema.mjs # every table reachable through PostgREST
npx vitest run                          # 193 unit tests
npx tsc --noEmit && npx vite build
```

`test-rls.mjs` is the one that matters most: it creates throwaway users and
organisations, exercises every policy through their own session tokens rather
than the service role, and deletes everything it made. It covers what an
employee can and cannot see, that a forged `organization_id` is refused in
both directions, that the handover still works across employees, that a
manager can settle a charge, that one operator is one row in the monthly
rollup, that a deactivated account loses access, and that the scratch field
locks hold while still letting an employee record what they sold.

### Still unverified
Signing in as a staff account and hitting the forced password-change screen.
Typing someone else's password to authenticate was deliberately left to a
human. Create a staff account, sign in as them, and confirm «Ορίστε τον δικό
σας κωδικό» appears before anything else loads.

---

## A note on migrations

Several pasted SQL statements during development reported success in the
Supabase editor without changing a row — three times, while others applied
cleanly, and the cause was never established. Nothing was lost because every
migration was probed afterwards rather than trusted.

Keep doing that. Each migration file ends with a verification query for exactly
this reason; run it, and believe the result rather than the editor.
