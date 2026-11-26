-- 033: let the quote timeline record customer decisions.
-- quote_portal_decide (026) writes a timeline line with type 'Customer' ("Accepted online by ..."), and the app
-- already shows that type, but the table's check constraint only allowed 'System' and 'Task'. Every online
-- accept or decline therefore failed with "violates check constraint timeline_events_type_check" (and was rolled back).
alter table public.timeline_events drop constraint if exists timeline_events_type_check;
alter table public.timeline_events add constraint timeline_events_type_check check (type in ('System', 'Task', 'Customer'));
