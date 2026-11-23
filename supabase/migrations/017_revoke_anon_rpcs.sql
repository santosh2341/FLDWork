-- Signed-out visitors should not be able to call these (they also check the session inside). invite_info stays open: the invite page needs it before sign-in.
revoke execute on function public.ai_take_credit(integer) from public, anon;
revoke execute on function public.list_team() from public, anon;
revoke execute on function public.set_member_role(uuid, public.user_role) from public, anon;
grant execute on function public.ai_take_credit(integer) to authenticated, service_role;
grant execute on function public.list_team() to authenticated;
grant execute on function public.set_member_role(uuid, public.user_role) to authenticated;
