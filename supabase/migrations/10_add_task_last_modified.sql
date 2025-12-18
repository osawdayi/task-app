-- Add last_modified column to tasks table
alter table public.tasks
add column last_modified timestamp with time zone default timezone('utc'::text, now());

-- Initialize existing tasks with their updated_at value (or current timestamp if null)
update public.tasks
set last_modified = coalesce(updated_at, timezone('utc'::text, now()))
where last_modified is null;

-- Function to automatically update last_modified when a task is updated
create or replace function update_task_last_modified() 
returns trigger
security definer
set search_path = public
as $$
begin
  -- Update last_modified to current timestamp whenever task is modified
  NEW.last_modified = timezone('utc'::text, now());
  return NEW;
end;
$$ language plpgsql;

-- Trigger to update last_modified before task update
create trigger update_task_last_modified_trigger
  before update on public.tasks
  for each row
  execute function update_task_last_modified();

-- Also set last_modified on insert (for new tasks)
create or replace function set_task_last_modified_on_insert() 
returns trigger
security definer
set search_path = public
as $$
begin
  -- Set last_modified to current timestamp for new tasks
  NEW.last_modified = timezone('utc'::text, now());
  return NEW;
end;
$$ language plpgsql;

-- Trigger to set last_modified before task insert
create trigger set_task_last_modified_on_insert_trigger
  before insert on public.tasks
  for each row
  execute function set_task_last_modified_on_insert();

