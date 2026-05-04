# Google Business Profile Review Assistant (Firebase Backend MVP)

Secure TypeScript/Express backend MVP for this flow:

1. Business owner connects Google Business Profile via OAuth.
2. Google refresh token is encrypted at rest.
3. Scheduled polling checks reviews twice daily.
4. New reviews are stored (deduplicated).
5. AI reply suggestions are generated.
6. Review + suggestion is sent via WhatsApp (Twilio).
7. Owner must explicitly approve/reject.
8. Only approved exact reply is posted to Google.

## Stack

- Node.js + TypeScript
- Express.js
- Firebase Admin SDK (Cloud Firestore)
- Google OAuth 2.0 + Google Business Profile APIs
- Twilio WhatsApp API
- OpenAI API
- node-cron

## Security Controls

- Google refresh tokens encrypted at rest with AES-256-GCM (`TOKEN_ENCRYPTION_KEY`).
- Twilio webhook signature validation (`X-Twilio-Signature`).
- Approval tokens are random, long (64 hex chars), single-use, and expire in 48h.
- Reply editing via WhatsApp is not supported in MVP.
- Only exact stored `aiSuggestedReply` is posted after explicit approval.
- Approval audit logging includes timestamp, WhatsApp number, review ID, and reply text.
- Duplicate reviews prevented by `(businessId, googleReviewId)` dedupe check.
- Duplicate WhatsApp notifications prevented by one-time new review processing.
- Rate limiting on public endpoints.
- Secrets loaded from environment variables.

## Project Structure

```text
src/
  app.ts
  server.ts
  config/
    env.ts
    firebase.ts
    logger.ts
  jobs/
    scheduler.ts
  lib/
    encryption.ts
    errors.ts
    firestoreStore.ts
  middleware/
    asyncHandler.ts
    errorHandler.ts
    rateLimit.ts
  routes/
    auth.routes.ts
    dashboard.routes.ts
    jobs.routes.ts
    twilio.routes.ts
  services/
    approval.service.ts
    auditLog.service.ts
    auth.service.ts
    dashboard.service.ts
    googleBusiness.service.ts
    openaiReply.service.ts
    reviewPolling.service.ts
    twilio.service.ts
  types/
    domain.ts
    express.d.ts
```

## Data Model (Firestore Collections)

- `review_assistant_users`
- `review_assistant_businesses`
- `review_assistant_reviews`
- `review_assistant_approval_tokens`
- `review_assistant_audit_logs`

Prefix is configurable via `FIRESTORE_COLLECTION_PREFIX`.

## Nhost Database SQL (Copy/Paste)

If you want the same data model in Nhost Postgres, use:

- `sql/nhost_init.sql`

How to run:

1. Open your Nhost project.
2. Go to the SQL editor.
3. Paste the content of `sql/nhost_init.sql`.
4. Execute it once.

The script creates:

- enum `review_status`
- tables:
  - `review_assistant_users`
  - `review_assistant_businesses`
  - `review_assistant_reviews`
  - `review_assistant_approval_tokens`
  - `review_assistant_audit_logs`
- indexes + `updated_at` triggers

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env
# fill required values
```

3. Start development server:

```bash
npm run dev
```

`npm run dev` is configured to load `.env.example` via `ENV_FILE=.env.example` for local testing.

## Firebase Credentials

Use one of these options:

1. Service account env vars:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` (with `\n` escaped newlines)

2. Application Default Credentials:
- `FIREBASE_USE_APPLICATION_DEFAULT=true`

For local emulator:
- Set `FIRESTORE_EMULATOR_HOST=localhost:8080`

Reference: Firebase docs for Admin SDK + emulator behavior:
- https://firebase.google.com/docs/admin/setup
- https://firebase.google.com/docs/emulator-suite/connect_firestore

## Dashboard

### `GET /dashboard`
Server-rendered management dashboard for:
- customer onboarding
- OAuth start/reconnect
- business/review status overview
- manual polling trigger

### `GET /dashboard/businesses/:businessId`
Business detail page with:
- reviews + AI suggestions + approval token state
- audit logs
- WhatsApp number update form

## API Endpoints

### Auth

#### `GET /auth/google`
Starts OAuth flow.

Query parameters:
- `email` (required)
- `whatsappNumber` (required)
- `googleAccountId` (optional)
- `googleLocationId` (optional)
- `redirectTo` (optional, internal dashboard redirect)

#### `GET /auth/google/callback`
- Exchanges code for tokens.
- Encrypts and stores refresh token.
- Fetches Google accounts/locations.
- Selects location (from state or first available).
- Saves/updates business record.

### Webhook

#### `POST /webhooks/twilio/whatsapp`
Receives WhatsApp replies.

Supported commands:
- `APPROVE <token>`
- `REJECT <token>`

Approval behavior:
- validates token + expiry + single-use
- validates sender WhatsApp number
- logs approval with timestamp, phone, review ID, exact reply text
- posts exact stored AI reply only after explicit approval

### Internal

#### `POST /jobs/poll-reviews`
Manual polling trigger (for cron/worker).

If `INTERNAL_JOB_API_KEY` is set, include header:
- `x-job-key: <INTERNAL_JOB_API_KEY>`

Behavior:
- loops connected businesses with staggered delays
- refreshes Google access token
- fetches reviews
- stores only new reviews
- generates AI suggestions
- creates approval tokens
- sends WhatsApp notifications

## Polling Schedule

Configured by env:
- `POLL_CRON_SCHEDULE=0 10,18 * * *`
- `POLL_TIMEZONE=Europe/Vienna`

This runs at 10:00 and 18:00 local scheduler timezone.

## Notes

- Root (`/`) redirects to `/dashboard`.
- If Firestore is unavailable, dashboard shows a warning with empty data.
- For production, lock down `/jobs/poll-reviews` and run behind HTTPS/proxy.
