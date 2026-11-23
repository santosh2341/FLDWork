-- Job photos: private storage bucket 'job-photos' (files under <company_id>/<job_id>/...), table job_photos, RLS.
-- Applied live. Also add to load_all(), before 'recurring':
--   'jobPhotos', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'jobId', h.job_id, 'path', h.path, 'name', h.name, 'author', h.author, 'at', h.created_at) order by h.created_at desc) from public.job_photos h), '[]'),
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-photos', 'job-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create table if not exists public.job_photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company() references public.companies(id) on delete cascade,
  job_id bigint not null references public.jobs(id) on delete cascade,
  path text not null,
  name text not null default '',
  author text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists job_photos_job on public.job_photos(job_id);
alter table public.job_photos enable row level security;
create policy "job_photos read" on public.job_photos for select using (company_id = (select public.current_company()));
create policy "job_photos insert" on public.job_photos for insert with check (company_id = (select public.current_company()) and ((select public.can_write()) or (select public.current_role_name()) = 'technician'));
create policy "job_photos delete" on public.job_photos for delete using (company_id = (select public.current_company()) and (select public.can_write()));
create policy "job photos read" on storage.objects for select to authenticated using (bucket_id = 'job-photos' and (storage.foldername(name))[1] = (select public.current_company())::text);
create policy "job photos upload" on storage.objects for insert to authenticated with check (bucket_id = 'job-photos' and (storage.foldername(name))[1] = (select public.current_company())::text and ((select public.can_write()) or (select public.current_role_name()) = 'technician'));
create policy "job photos delete" on storage.objects for delete to authenticated using (bucket_id = 'job-photos' and (storage.foldername(name))[1] = (select public.current_company())::text and (select public.can_write()));
