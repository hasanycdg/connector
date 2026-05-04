# Google Business Profile Review Assistant (Secure Backend MVP)

Secure TypeScript/Express backend MVP for this flow:

1. Business owner connects Google Business Profile via OAuth.
2. Refresh token is stored encrypted (AES-256-GCM).
3. Scheduled polling checks reviews twice daily.
4. New reviews are stored (deduplicated).
5. AI reply suggestions are generated.
6. Review + suggestion is sent to owner via WhatsApp (Twilio).
7. Owner must explicitly approve/reject.
8. Only approved exact reply is posted to Google.

## Tech Stack

- Node.js + TypeScript
- Express.js
- PostgreSQL
- Prisma ORM
- Google OAuth 2.0 + Google Business Profile APIs
- Twilio WhatsApp API
- OpenAI API
- Firebase Web SDK config (initialized in backend for shared project config)
- node-cron

## Security Controls Implemented

- Google refresh tokens encrypted at rest using AES-256-GCM (`TOKEN_ENCRYPTION_KEY`).
- Twilio webhook signature validation (`X-Twilio-Signature`).
- Approval tokens are random, long (64 hex chars), single-use, and expire in 48h.
- Reply editing via WhatsApp is not supported in MVP.
- Only exact stored `aiSuggestedReply` is posted to Google after explicit approval.
- Approval audit logging includes timestamp, WhatsApp number, review ID, reply text.
- Duplicate reviews prevented with DB unique constraint.
- Duplicate WhatsApp notifications prevented by one-time new-review processing.
- Rate limiting for public endpoints.
- Secrets loaded from environment variables only.

## Project Structure

```text
src/
  app.ts
  server.ts
  config/
    env.ts
    logger.ts
  jobs/
    scheduler.ts
  lib/
    encryption.ts
    errors.ts
    prisma.ts
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
    dashboard.service.ts
    auth.service.ts
    googleBusiness.service.ts
    openaiReply.service.ts
    reviewPolling.service.ts
    twilio.service.ts
prisma/
  schema.prisma
sql/
  schema.sql
```

## Database Schema

- Prisma schema: `prisma/schema.prisma`
- SQL schema export: `sql/schema.sql`

Core tables:
- `users`
- `businesses`
- `reviews`
- `approval_tokens`
- `audit_logs`

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env
# fill all required values
```

3. Generate Prisma client:

```bash
npm run prisma:generate
```

4. Run migrations:

```bash
npm run prisma:migrate
```

5. Start development server:

```bash
npm run dev
```

`npm run dev` is configured to load `.env.example` via `ENV_FILE=.env.example` for local testing.

## Firebase SDK

- Firebase config is stored in env vars and initialized at server startup in `src/config/firebase.ts`.
- `firebase/analytics` is intentionally **not** initialized in backend runtime (Analytics is browser-only).

## API Endpoints

### Dashboard

#### `GET /dashboard`
Server-rendered management dashboard for:
- customer onboarding
- OAuth start/reconnect
- business/review status overview
- manual polling trigger

#### `GET /dashboard/businesses/:businessId`
Business detail page with:
- reviews + AI suggestions + approval token state
- audit logs
- WhatsApp number update form

### Auth

#### `GET /auth/google`
Starts OAuth flow.

Query parameters:
- `email` (required)
- `whatsappNumber` (required)
- `googleAccountId` (optional)
- `googleLocationId` (optional)

Example:

```text
/auth/google?email=owner@example.com&whatsappNumber=+49123456789
```

#### `GET /auth/google/callback`
- Exchanges code for tokens.
- Encrypts and stores refresh token.
- Fetches Google accounts/locations.
- Selects location (from state or first available).
- Saves/updates business record.

### Webhook

#### `POST /webhooks/twilio/whatsapp`
Receives WhatsApp replies from Twilio.

Supported commands:
- `APPROVE <token>`
- `REJECT <token>`

Approval behavior:
- validates token + expiry + single-use
- validates sender WhatsApp number
- logs approval with timestamp, phone, review ID, and exact reply text
- posts exact stored AI reply to Google only after approval

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

Additional jitter (`POLL_STAGGER_SECONDS`) reduces simultaneous processing bursts.

## WhatsApp Message Template

```text
New Google Review

Business: {{businessName}}
Rating: {{rating}}/5
Reviewer: {{reviewerName}}

Review:
"{{reviewComment}}"

Suggested reply:
"{{aiSuggestedReply}}"

To approve and post this exact reply to Google, reply:
APPROVE {{token}}

To reject:
REJECT {{token}}
```

## Notes for Production Hardening

- Put app behind HTTPS + trusted reverse proxy.
- Lock down `/jobs/poll-reviews` at network and auth layer.
- Add retry queues/dead-letter handling for external API failures.
- Add monitoring/alerts around `ERROR` review status and failed audit writes.
