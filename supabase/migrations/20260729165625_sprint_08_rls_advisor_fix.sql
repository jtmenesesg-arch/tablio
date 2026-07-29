-- Sprint 8: evaluate auth.uid() once per statement in the platform-membership policy.

drop policy if exists platform_membership_self_select
on public.platform_memberships;

create policy platform_membership_self_select
on public.platform_memberships for select to authenticated
using (user_id = (select auth.uid()));
