-- ═══════════════════════════════════════════════════════════════
--  Per-category vault access control
--
--  Lets a vault owner choose which family members receive each
--  vault category (financial, legal, medical, …) when the vault
--  is released.
--
--  Default semantics: if a category has NO rows for an owner,
--  every trusted contact (family_members.is_trusted_contact)
--  can see it after release. If rows exist, ONLY the listed
--  members can see that category.
--
--  Also adds the (previously missing) read path: family members
--  could never SELECT vault_items even after release. New RLS
--  policies grant read access once profiles.vault_status =
--  'released', filtered by the category rules above.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Access rules table ─────────────────────────────────────
create table if not exists vault_category_access (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users(id)     on delete cascade,  -- vault owner
  category         text        not null,  -- matches vault_items.category ('media' | 'personal_messages' | 'legal' | 'financial' | 'medical' | 'property' | 'digital_assets')
  family_member_id uuid        not null references family_members(id) on delete cascade,
  created_at       timestamptz not null default now(),

  unique (user_id, category, family_member_id)
);

alter table vault_category_access enable row level security;

drop policy if exists owners_manage_own_access_rules on vault_category_access;
drop policy if exists members_view_rules_about_them  on vault_category_access;

create policy owners_manage_own_access_rules
  on vault_category_access for all
  using     (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy members_view_rules_about_them
  on vault_category_access for select
  using (
    exists (
      select 1 from family_members fm
      where fm.id = vault_category_access.family_member_id
        and fm.member_user_id = auth.uid()
    )
  );

-- ── 2. Released-vault visibility check ────────────────────────
--  SECURITY DEFINER so the policy can consult profiles /
--  family_members without tripping over their own RLS.
create or replace function public.vault_member_can_view(owner_id uuid, item_category text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from profiles p
    join family_members fm
      on fm.user_id = owner_id
     and fm.member_user_id = auth.uid()
     and fm.status = 'accepted'
    where p.id = owner_id
      and p.vault_status = 'released'
      and (
        -- no explicit rules for this category → all trusted contacts
        ( not exists (
            select 1 from vault_category_access a
            where a.user_id = owner_id and a.category = item_category)
          and fm.is_trusted_contact )
        or
        -- explicit rules → member must be listed
        exists (
          select 1 from vault_category_access a
          where a.user_id  = owner_id
            and a.category = item_category
            and a.family_member_id = fm.id)
      )
  );
$$;

-- Any released category visible to this member? (used for storage reads)
create or replace function public.vault_member_can_view_owner_files(owner_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from vault_items vi
    where vi.user_id = owner_id
      and public.vault_member_can_view(owner_id, vi.category)
  );
$$;

-- ── 3. RLS: family members read released vault items ──────────
drop policy if exists family_view_released_vault_items on vault_items;

create policy family_view_released_vault_items
  on vault_items for select
  using (public.vault_member_can_view(user_id, category));

-- ── 4. Storage: family members read released vault files ──────
drop policy if exists vault_files_read_released on storage.objects;

create policy vault_files_read_released
  on storage.objects for select
  using (
    bucket_id = 'vault-files'
    and public.vault_member_can_view_owner_files(
          ((storage.foldername(name))[1])::uuid)
  );
