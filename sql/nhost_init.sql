-- Nhost / Postgres schema for GBP Review Assistant
-- Paste this into Nhost SQL editor and run once.

create extension if not exists pgcrypto;

create type public.review_status as enum (
  'NEW',
  'SENT_TO_WHATSAPP',
  'APPROVED',
  'POSTED',
  'REJECTED',
  'ERROR'
);

create table if not exists public.review_assistant_users (
  id text primary key,
  email text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_assistant_users_email_lowercase_chk check (email = lower(email))
);

create table if not exists public.review_assistant_businesses (
  id text primary key,
  user_id text not null references public.review_assistant_users(id) on delete cascade,
  google_account_id text not null,
  google_location_id text not null,
  business_name text not null,
  whatsapp_number text not null,
  google_refresh_token_encrypted text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_assistant_businesses_google_mapping_uniq unique (google_account_id, google_location_id)
);

create table if not exists public.review_assistant_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id text not null references public.review_assistant_businesses(id) on delete cascade,
  google_review_id text not null,
  reviewer_name text not null,
  rating integer not null check (rating between 1 and 5),
  comment text not null default '',
  create_time timestamptz not null,
  update_time timestamptz not null,
  ai_suggested_reply text,
  status public.review_status not null default 'NEW',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_assistant_reviews_business_google_review_uniq unique (business_id, google_review_id)
);

create table if not exists public.review_assistant_approval_tokens (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review_assistant_reviews(id) on delete cascade,
  business_id text not null references public.review_assistant_businesses(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_assistant_approval_tokens_expiry_chk check (expires_at > created_at)
);

create table if not exists public.review_assistant_audit_logs (
  id uuid primary key default gen_random_uuid(),
  business_id text not null references public.review_assistant_businesses(id) on delete cascade,
  review_id uuid references public.review_assistant_reviews(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists review_assistant_businesses_user_id_idx
  on public.review_assistant_businesses (user_id);

create index if not exists review_assistant_reviews_business_id_idx
  on public.review_assistant_reviews (business_id);

create index if not exists review_assistant_reviews_status_idx
  on public.review_assistant_reviews (status);

create index if not exists review_assistant_reviews_create_time_idx
  on public.review_assistant_reviews (create_time desc);

create index if not exists review_assistant_approval_tokens_review_id_idx
  on public.review_assistant_approval_tokens (review_id);

create index if not exists review_assistant_approval_tokens_business_id_idx
  on public.review_assistant_approval_tokens (business_id);

create index if not exists review_assistant_approval_tokens_token_idx
  on public.review_assistant_approval_tokens (token);

create index if not exists review_assistant_approval_tokens_expires_at_idx
  on public.review_assistant_approval_tokens (expires_at);

create index if not exists review_assistant_audit_logs_business_id_idx
  on public.review_assistant_audit_logs (business_id);

create index if not exists review_assistant_audit_logs_review_id_idx
  on public.review_assistant_audit_logs (review_id);

create index if not exists review_assistant_audit_logs_created_at_idx
  on public.review_assistant_audit_logs (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_review_assistant_users_updated_at on public.review_assistant_users;
create trigger set_review_assistant_users_updated_at
before update on public.review_assistant_users
for each row
execute procedure public.set_updated_at();

drop trigger if exists set_review_assistant_businesses_updated_at on public.review_assistant_businesses;
create trigger set_review_assistant_businesses_updated_at
before update on public.review_assistant_businesses
for each row
execute procedure public.set_updated_at();

drop trigger if exists set_review_assistant_reviews_updated_at on public.review_assistant_reviews;
create trigger set_review_assistant_reviews_updated_at
before update on public.review_assistant_reviews
for each row
execute procedure public.set_updated_at();

drop trigger if exists set_review_assistant_approval_tokens_updated_at on public.review_assistant_approval_tokens;
create trigger set_review_assistant_approval_tokens_updated_at
before update on public.review_assistant_approval_tokens
for each row
execute procedure public.set_updated_at();
