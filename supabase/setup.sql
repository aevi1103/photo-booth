-- Run in the Supabase SQL editor. Add administrators as described in README.
create table if not exists public.booth_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.booth_admins enable row level security;

create or replace function public.is_booth_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.booth_admins where user_id = auth.uid()); $$;
revoke all on function public.is_booth_admin() from public;
grant execute on function public.is_booth_admin() to anon, authenticated;

create table if not exists public.backgrounds (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  path text not null unique,
  created_at timestamptz not null default now()
);
alter table public.backgrounds enable row level security;
create policy "Anyone can see backgrounds" on public.backgrounds for select to anon, authenticated using (true);
create policy "Admins can add backgrounds" on public.backgrounds for insert to authenticated with check (public.is_booth_admin());
create policy "Admins can delete backgrounds" on public.backgrounds for delete to authenticated using (public.is_booth_admin());
grant select on public.backgrounds to anon, authenticated;
grant insert, delete on public.backgrounds to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backgrounds', 'backgrounds', true, 8388608, array['image/jpeg','image/png','image/webp']),
       ('photos', 'photos', false, 8388608, array['image/jpeg'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Admins can upload backgrounds" on storage.objects for insert to authenticated
with check (bucket_id = 'backgrounds' and public.is_booth_admin());
create policy "Admins can manage background objects" on storage.objects for select to authenticated
using (bucket_id = 'backgrounds' and public.is_booth_admin());
create policy "Admins can delete backgrounds" on storage.objects for delete to authenticated
using (bucket_id = 'backgrounds' and public.is_booth_admin());
create policy "Admins can read photos" on storage.objects for select to authenticated
using (bucket_id = 'photos' and public.is_booth_admin());
create policy "Admins can delete photos" on storage.objects for delete to authenticated
using (bucket_id = 'photos' and public.is_booth_admin());

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
