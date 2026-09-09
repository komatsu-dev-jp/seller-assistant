begin;

-- pg_restore loads table data with a restricted search_path. Keep these SQL
-- helpers independent of the caller's path so CHECK constraints can validate
-- checked inventory and location codes while COPY restores existing rows.
create or replace function public.app_code_check_digit(base_code text) returns integer
language sql immutable strict
set search_path = pg_catalog, public
as $$
  select mod(sum(
    ascii(substr(upper(base_code), position, 1)) *
    case when mod(length(base_code) - position, 2) = 0 then 3 else 1 end
  ), 10)::integer
  from generate_series(1, length(base_code)) as position
$$;

create or replace function public.app_append_code_check_digit(base_code text) returns text
language sql immutable strict
set search_path = pg_catalog, public
as $$
  select upper(btrim(base_code)) || '-' ||
    public.app_code_check_digit(upper(btrim(base_code)))::text
$$;

create or replace function public.app_has_valid_code_check_digit(code text) returns boolean
language sql immutable strict
set search_path = pg_catalog, public
as $$
  select case
    when code ~ '-[0-9]$'
      then right(code, 1)::integer =
        public.app_code_check_digit(left(code, length(code) - 2))
    else false
  end
$$;

commit;
