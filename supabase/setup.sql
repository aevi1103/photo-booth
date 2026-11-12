-- Run in the Supabase SQL editor, including when upgrading an existing booth.
-- Stored photos stay private; only the authenticated server API writes to Storage.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 8388608, array['image/jpeg'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Backdrops are shared with signed-in guests, but uploaded only by the admin API.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backdrops', 'backdrops', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Booth backdrops are server managed" on storage.objects;
create policy "Booth backdrops are server managed" on storage.objects
as restrictive for all to anon, authenticated
using (bucket_id <> 'backdrops') with check (bucket_id <> 'backdrops');

create table if not exists public.photo_upload_limits (
  id boolean primary key default true check (id),
  window_start timestamptz not null,
  count integer not null
);
alter table public.photo_upload_limits enable row level security;

create or replace function public.allow_photo_upload()
returns boolean language plpgsql security definer set search_path = ''
as $$
declare current_count integer;
begin
  insert into public.photo_upload_limits (id, window_start, count)
  values (true, now(), 1)
  on conflict (id) do update set
    window_start = case when photo_upload_limits.window_start < now() - interval '1 minute' then now() else photo_upload_limits.window_start end,
    count = case when photo_upload_limits.window_start < now() - interval '1 minute' then 1 else photo_upload_limits.count + 1 end
  returning count into current_count;
  return current_count <= 60;
end;
$$;
revoke all on function public.allow_photo_upload() from public, anon, authenticated;
grant execute on function public.allow_photo_upload() to service_role;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin'))
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;
drop policy if exists "Read own booth role" on public.profiles;
create policy "Read own booth role" on public.profiles for select to authenticated using (id = auth.uid());

create or replace function public.create_booth_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  -- Never accept a role from user-editable OAuth metadata.
  insert into public.profiles(id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.create_booth_profile() from public, anon, authenticated;
drop trigger if exists create_booth_profile on auth.users;
create trigger create_booth_profile after insert on auth.users
for each row execute function public.create_booth_profile();
insert into public.profiles(id) select id from auth.users on conflict (id) do nothing;

create table if not exists public.photo_uploads (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  path text not null unique,
  status text not null default 'reserved' check (status in ('reserved', 'uploaded')),
  created_at timestamptz not null default now()
);
create index if not exists photo_uploads_user_id_idx on public.photo_uploads(user_id);
alter table public.photo_uploads enable row level security;
revoke all on public.photo_uploads from anon, authenticated;
grant all on public.photo_uploads to service_role;

create or replace function public.get_photo_quota(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'role', p.role,
    'used', (select count(*) from public.photo_uploads u where u.user_id = p.id),
    'limit', case when p.role = 'admin' then null else 20 end,
    'remaining', case when p.role = 'admin' then null else greatest(0, 20 - (select count(*)::integer from public.photo_uploads u where u.user_id = p.id)) end
  ) from public.profiles p where p.id = p_user_id;
$$;

create or replace function public.reserve_photo_upload(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  quota jsonb;
  upload_id uuid := gen_random_uuid();
  upload_path text;
begin
  -- Serialize reservations per user so concurrent requests cannot exceed 20.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select public.get_photo_quota(p_user_id) into quota;
  if quota is null then raise exception 'Booth profile not found'; end if;
  if quota->>'role' <> 'admin' and (quota->>'remaining')::integer <= 0 then
    return jsonb_build_object('allowed', false, 'quota', quota);
  end if;
  upload_path := p_user_id::text || '/' || upload_id::text || '.jpg';
  insert into public.photo_uploads(id, user_id, path) values (upload_id, p_user_id, upload_path);
  return jsonb_build_object('allowed', true, 'id', upload_id, 'path', upload_path, 'quota', public.get_photo_quota(p_user_id));
end;
$$;

create or replace function public.release_photo_upload(p_upload_id uuid)
returns void language sql security definer set search_path = ''
as $$
  delete from public.photo_uploads u where u.id = p_upload_id and u.status = 'reserved'
  and not exists (select 1 from storage.objects o where o.bucket_id = 'photos' and o.name = u.path);
$$;

create or replace function public.list_booth_photos(p_user_id uuid, p_offset integer default 0)
returns table(name text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select o.name, o.created_at from storage.objects o
  where o.bucket_id = 'photos'
    and o.name ~* '\.(jpe?g|png|webp)$'
    and exists (
      select 1 from public.profiles p where p.id = p_user_id
      and (p.role = 'admin' or split_part(o.name, '/', 1) = p_user_id::text)
    )
  order by o.created_at desc, o.name desc limit 25 offset greatest(p_offset, 0);
$$;

revoke all on function public.get_photo_quota(uuid) from public, anon, authenticated;
revoke all on function public.reserve_photo_upload(uuid) from public, anon, authenticated;
revoke all on function public.release_photo_upload(uuid) from public, anon, authenticated;
revoke all on function public.list_booth_photos(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_photo_quota(uuid) to service_role;
grant execute on function public.reserve_photo_upload(uuid) to service_role;
grant execute on function public.release_photo_upload(uuid) to service_role;
grant execute on function public.list_booth_photos(uuid, integer) to service_role;

-- Prevent bypassing the server's quota even if older permissive policies exist.
-- Other buckets are unaffected; service_role bypasses RLS.
drop policy if exists "Booth photos are server managed" on storage.objects;
create policy "Booth photos are server managed" on storage.objects
as restrictive for all to anon, authenticated
using (bucket_id <> 'photos') with check (bucket_id <> 'photos');
