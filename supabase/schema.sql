-- ═══════════════════════════════════════════════════════════════
--  SOLACE LIFE — Supabase Database Schema
--  Run this entire file in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════


-- ─── 1. PROFILES ────────────────────────────────────────────────
-- One row per auth user. Created automatically on sign-up (see trigger below).

create table if not exists profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  full_name        text,
  avatar_url       text,
  plan             text        not null default 'free',      -- 'free' | 'premium'
  vault_released   boolean     not null default false,
  trusted_contact  text,                                     -- email of the person who can release vault
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Auto-create a profile row whenever a new user signs up
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Auto-update updated_at on any profile change
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at
  before update on profiles
  for each row execute procedure touch_updated_at();


-- ─── 2. VAULT ITEMS ─────────────────────────────────────────────
-- Documents, files, and entries the user stores in their vault.

create table if not exists vault_items (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  title        text        not null,
  category     text        not null,   -- 'legal' | 'financial' | 'property' | 'personal_messages' | 'medical' | 'digital_assets'
  description  text,
  content      text,                   -- notes / instructions
  username     text,                   -- optional login username / account ID
  password     text,                   -- optional password / PIN (stored encrypted at rest by Supabase)
  file_url     text,                   -- Supabase Storage public URL
  file_path    text,                   -- Supabase Storage path (for deletion)
  file_name    text,
  file_size    bigint,
  file_type    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Migration: add username/password to existing vault_items tables
alter table vault_items add column if not exists username text;
alter table vault_items add column if not exists password text;

drop trigger if exists vault_items_updated_at on vault_items;
create trigger vault_items_updated_at
  before update on vault_items
  for each row execute procedure touch_updated_at();


-- ─── 3. MEMORIES ────────────────────────────────────────────────
-- Voice memos, video messages, photo albums, written stories.

create table if not exists memories (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  title        text        not null,
  type         text        not null,   -- 'voice' | 'video' | 'photo' | 'written'
  description  text,
  content      text,                   -- for written stories
  file_url     text,                   -- Supabase Storage public URL
  file_path    text,                   -- Supabase Storage path (for deletion)
  file_name    text,
  file_size    bigint,
  file_type    text,
  duration     integer,                -- seconds, for voice/video
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists memories_updated_at on memories;
create trigger memories_updated_at
  before update on memories
  for each row execute procedure touch_updated_at();


-- ─── 4. FAMILY MEMBERS ──────────────────────────────────────────
-- People the user invites to eventually access their vault.

create table if not exists family_members (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,  -- vault owner
  member_user_id    uuid        references auth.users(id),                              -- null until accepted
  name              text        not null,
  email             text        not null,
  relationship      text,                   -- 'Spouse' | 'Child' | 'Sibling' | 'Friend' | 'Other'
  date_of_birth     text,                   -- e.g. "March 15, 1958"
  anniversary       text,                   -- spouse only, e.g. "June 12, 1995"
  status            text        not null default 'pending',  -- 'pending' | 'accepted' | 'declined'
  is_trusted_contact boolean   not null default false,      -- can trigger vault release
  invited_at        timestamptz not null default now(),
  accepted_at       timestamptz,
  created_at        timestamptz not null default now(),

  unique (user_id, email)  -- prevent duplicate invites to same email
);

-- Migration: add new fields to existing family_members tables
alter table family_members add column if not exists date_of_birth text;
alter table family_members add column if not exists anniversary text;


-- ═══════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY (RLS)
--  Each user can only read/write their own rows.
-- ═══════════════════════════════════════════════════════════════

-- profiles
alter table profiles enable row level security;

drop policy if exists "Users can view own profile"   on profiles;
drop policy if exists "Users can update own profile" on profiles;

create policy "Users can view own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);


-- vault_items
alter table vault_items enable row level security;

drop policy if exists "Users can view own vault items"   on vault_items;
drop policy if exists "Users can insert own vault items" on vault_items;
drop policy if exists "Users can update own vault items" on vault_items;
drop policy if exists "Users can delete own vault items" on vault_items;

create policy "Users can view own vault items"
  on vault_items for select
  using (auth.uid() = user_id);

create policy "Users can insert own vault items"
  on vault_items for insert
  with check (auth.uid() = user_id);

create policy "Users can update own vault items"
  on vault_items for update
  using (auth.uid() = user_id);

create policy "Users can delete own vault items"
  on vault_items for delete
  using (auth.uid() = user_id);


-- memories
alter table memories enable row level security;

drop policy if exists "Users can view own memories"   on memories;
drop policy if exists "Users can insert own memories" on memories;
drop policy if exists "Users can update own memories" on memories;
drop policy if exists "Users can delete own memories" on memories;

create policy "Users can view own memories"
  on memories for select
  using (auth.uid() = user_id);

create policy "Users can insert own memories"
  on memories for insert
  with check (auth.uid() = user_id);

create policy "Users can update own memories"
  on memories for update
  using (auth.uid() = user_id);

create policy "Users can delete own memories"
  on memories for delete
  using (auth.uid() = user_id);


-- family_members
alter table family_members enable row level security;

drop policy if exists "Users can view own family list" on family_members;
drop policy if exists "Users can invite family"        on family_members;
drop policy if exists "Users can update family"        on family_members;
drop policy if exists "Users can remove family"        on family_members;

create policy "Users can view own family list"
  on family_members for select
  using (auth.uid() = user_id);

create policy "Users can invite family"
  on family_members for insert
  with check (auth.uid() = user_id);

create policy "Users can update family"
  on family_members for update
  using (auth.uid() = user_id);

create policy "Users can remove family"
  on family_members for delete
  using (auth.uid() = user_id);


-- ─── 5. SCHEDULED DELIVERIES (Time Capsules) ────────────────────
-- A memory scheduled to be released to a family member on a future date.

create table if not exists scheduled_deliveries (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  memory_id         uuid        not null references memories(id) on delete cascade,
  family_member_id  uuid        not null references family_members(id) on delete cascade,
  scheduled_date    date        not null,
  message           text,                        -- optional personal note attached to delivery
  status            text        not null default 'pending',  -- 'pending' | 'delivered' | 'cancelled'
  delivered_at      timestamptz,
  created_at        timestamptz not null default now()
);

alter table scheduled_deliveries enable row level security;

drop policy if exists "Users can view own deliveries"   on scheduled_deliveries;
drop policy if exists "Users can insert own deliveries" on scheduled_deliveries;
drop policy if exists "Users can update own deliveries" on scheduled_deliveries;
drop policy if exists "Users can delete own deliveries" on scheduled_deliveries;

create policy "Users can view own deliveries"
  on scheduled_deliveries for select
  using (auth.uid() = user_id);

create policy "Users can insert own deliveries"
  on scheduled_deliveries for insert
  with check (auth.uid() = user_id);

create policy "Users can update own deliveries"
  on scheduled_deliveries for update
  using (auth.uid() = user_id);

create policy "Users can delete own deliveries"
  on scheduled_deliveries for delete
  using (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════
--  STORAGE BUCKETS
--  Run AFTER the tables above, still in SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- Vault files bucket (private — only authenticated owner can access)
insert into storage.buckets (id, name, public)
values ('vault-files', 'vault-files', false)
on conflict (id) do nothing;

-- Memories bucket (private)
insert into storage.buckets (id, name, public)
values ('memories', 'memories', false)
on conflict (id) do nothing;

-- Storage RLS: vault-files
drop policy if exists "vault-files upload"   on storage.objects;
drop policy if exists "vault-files read"     on storage.objects;
drop policy if exists "vault-files delete"   on storage.objects;

create policy "vault-files upload"
  on storage.objects for insert
  with check (bucket_id = 'vault-files' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "vault-files read"
  on storage.objects for select
  using (bucket_id = 'vault-files' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "vault-files delete"
  on storage.objects for delete
  using (bucket_id = 'vault-files' and auth.uid()::text = (storage.foldername(name))[1]);

-- Storage RLS: memories
drop policy if exists "memories upload" on storage.objects;
drop policy if exists "memories read"   on storage.objects;
drop policy if exists "memories delete" on storage.objects;

create policy "memories upload"
  on storage.objects for insert
  with check (bucket_id = 'memories' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "memories read"
  on storage.objects for select
  using (bucket_id = 'memories' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "memories delete"
  on storage.objects for delete
  using (bucket_id = 'memories' and auth.uid()::text = (storage.foldername(name))[1]);
