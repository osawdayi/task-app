-- Stripe integration
-- Note: Stripe customer creation is handled via edge functions, not FDW
-- The stripe_customer_id column is already defined in the profiles table

-- Security policy: Users can read their own Stripe data
create policy "Users can read own Stripe data"
  on public.profiles
  for select
  using (auth.uid() = user_id);