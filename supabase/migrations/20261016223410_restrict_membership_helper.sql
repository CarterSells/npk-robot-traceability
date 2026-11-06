-- Hosted Supabase default privileges may grant anon EXECUTE directly.
-- Revoking PUBLIC alone does not remove that direct grant.
begin;
revoke all on function public.is_org_member(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
commit;
