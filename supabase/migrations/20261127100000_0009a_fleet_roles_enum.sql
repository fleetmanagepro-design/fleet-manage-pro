-- 0009a_fleet_roles_enum
-- Two new built-in roles (owner's decision of 11/27/2026): Fleet Director and Fleet Manager.
-- Kept in its own migration: a new enum value can only be used after the transaction that adds it commits.

alter type public.org_role add value if not exists 'fleet_director' after 'admin';
alter type public.org_role add value if not exists 'fleet_manager' after 'fleet_director';
