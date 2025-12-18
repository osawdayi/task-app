-- Add dashboard_last_modified field to profiles table
alter table public.profiles
add column dashboard_last_modified timestamp with time zone default timezone('utc'::text, now());

-- Update existing profiles to have current timestamp
update public.profiles
set dashboard_last_modified = timezone('utc'::text, now())
where dashboard_last_modified is null;

