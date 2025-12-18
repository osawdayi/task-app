-- Function to update dashboard_last_modified when tasks are modified
create or replace function update_dashboard_last_modified() 
returns trigger
security definer
set search_path = public
as $$
begin
  -- Update dashboard_last_modified for the user who owns the task
  update public.profiles
  set dashboard_last_modified = timezone('utc'::text, now())
  where user_id = NEW.user_id;
  return NEW;
end;
$$ language plpgsql;

-- Trigger to update dashboard_last_modified after task insert
create trigger update_dashboard_on_task_insert
  after insert on public.tasks
  for each row
  execute function update_dashboard_last_modified();

-- Trigger to update dashboard_last_modified after task update
create trigger update_dashboard_on_task_update
  after update on public.tasks
  for each row
  execute function update_dashboard_last_modified();

-- Function to update dashboard_last_modified when tasks are deleted
create or replace function update_dashboard_last_modified_on_delete() 
returns trigger
security definer
set search_path = public
as $$
begin
  -- Update dashboard_last_modified for the user who owned the task
  update public.profiles
  set dashboard_last_modified = timezone('utc'::text, now())
  where user_id = OLD.user_id;
  return OLD;
end;
$$ language plpgsql;

-- Trigger to update dashboard_last_modified after task delete
create trigger update_dashboard_on_task_delete
  after delete on public.tasks
  for each row
  execute function update_dashboard_last_modified_on_delete();

