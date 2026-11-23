-- load_all() now also returns jobNotes and clock (applied live by patching the function definition).
-- To reproduce: add to the jsonb_build_object, before 'recurring':
--   'jobNotes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'jobId', n.job_id, 'author', n.author, 'text', n.text, 'at', n.created_at) order by n.created_at desc) from public.job_notes n), '[]'),
--   'clock', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'jobId', k.job_id, 'employeeId', k.employee_id, 'start', k.started_at, 'end', k.ended_at) order by k.started_at desc) from public.clock_entries k), '[]'),
select 1;
