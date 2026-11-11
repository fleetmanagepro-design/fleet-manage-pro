-- 0004e_per_mile_deductions
-- Truck / trailer rent by agreement (decision of 11/11/2026): a fixed weekly amount (optional) plus a rate per mile
-- for every mile driven that week over a number of free miles. Miles = loaded + empty on the week's paid loads;
-- the free miles start over every week.

alter type public.deduction_kind add value if not exists 'per_mile';

alter table public.driver_deductions
  add column rate_cents_per_mile int check (rate_cents_per_mile > 0),
  add column free_miles numeric(10, 1) check (free_miles >= 0);

-- kind is compared as text: a new enum value can't be used as a constant in the transaction that adds it.
alter table public.driver_deductions drop constraint driver_deductions_shape;
alter table public.driver_deductions add constraint driver_deductions_shape check (
  (kind::text = 'percent_of_gross' and percent is not null and amount_cents is null and rate_cents_per_mile is null and free_miles is null)
  or (kind::text = 'fixed_weekly' and amount_cents is not null and percent is null and rate_cents_per_mile is null and free_miles is null)
  or (kind::text = 'per_mile' and rate_cents_per_mile is not null and free_miles is not null and percent is null)
);
