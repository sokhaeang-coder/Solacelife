-- ═══════════════════════════════════════════════════════════════
--  Three-state vault access: sealed categories
--
--  States per category:
--    1. Never configured  → all trusted contacts receive it
--                           (the "residual clause" fallback)
--    2. Explicit selection → only the listed members receive it
--    3. Sealed            → NO ONE receives it (deliberate choice,
--                           stored here)
--
--  The Who Gets What modal pre-selects all trusted contacts, so
--  after the first save every category is explicit (state 2 or 3).
-- ═══════════════════════════════════════════════════════════════

create table if not exists vault_category_sealed (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  category   text        not null,
  created_at timestamptz not null default now(),

  unique (user_id, category)
);

alter table vault_category_sealed enable row level security;

drop policy if exists owners_manage_own_sealed on vault_category_sealed;

create policy owners_manage_own_sealed
  on vault_category_sealed for all
  using     (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Updated visibility check: sealed categories are never visible
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
      -- sealed → no one, ever
      and not exists (
        select 1 from vault_category_sealed s
        where s.user_id = owner_id and s.category = item_category)
      and (
        -- never configured → all trusted contacts
        ( not exists (
            select 1 from vault_category_access a
            where a.user_id = owner_id and a.category = item_category)
          and fm.is_trusted_contact )
        or
        -- explicit selection → member must be listed
        exists (
          select 1 from vault_category_access a
          where a.user_id  = owner_id
            and a.category = item_category
            and a.family_member_id = fm.id)
      )
  );
$$;
