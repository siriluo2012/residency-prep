-- Minimal stand-in for Supabase's auth schema so drizzle/0001_rls.sql can be applied to a plain
-- Postgres for local development and CI. Never run this against a real Supabase project.
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
