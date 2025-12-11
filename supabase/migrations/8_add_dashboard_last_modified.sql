-- Add dashboard_last_modified field to profiles table
ALTER TABLE public.profiles
ADD COLUMN dashboard_last_modified timestamp with time zone default timezone('utc'::text, now());

-- Update existing profiles to have current timestamp
UPDATE public.profiles
SET dashboard_last_modified = COALESCE(updated_at, created_at, timezone('utc'::text, now()))
WHERE dashboard_last_modified IS NULL;

