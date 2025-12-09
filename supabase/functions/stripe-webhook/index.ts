import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@12.0.0";

// Load environment variables
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") as string;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

console.log("🌍 Stripe Webhook is running...");

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

// This is needed in order to use the Web Crypto API in Deno.
const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  // Validate webhook secret
  if (!WEBHOOK_SECRET) {
    console.error("❌ STRIPE_WEBHOOK_SECRET is not set");
    return new Response(
      JSON.stringify({ error: "Webhook secret not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const signature = req.headers.get("Stripe-Signature");
  const body = await req.text();

  if (!signature) {
    console.error("❌ No Stripe signature found in headers");
    return new Response(
      JSON.stringify({ error: "No signature found" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      WEBHOOK_SECRET,
      undefined,
      cryptoProvider
    );

    console.log(`Received event: ${event.type}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        console.log(`📝 Processing checkout.session.completed for customer: ${session.customer}`);
        
        if (!session.customer) {
          console.error("❌ No customer ID in checkout session");
          break;
        }

        const { data: updatedProfile, error: updateError } = await supabase
          .from("profiles")
          .update({
            subscription_plan: "premium",
            tasks_limit: 10000,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", session.customer)
          .select();

        if (updateError) {
          console.error("❌ Error updating profile:", updateError);
          throw updateError;
        }

        if (!updatedProfile || updatedProfile.length === 0) {
          console.error(`❌ No profile found with stripe_customer_id: ${session.customer}`);
        } else {
          console.log(`✅ Updated profile to premium:`, updatedProfile[0]);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        console.log(`📝 Processing ${event.type} for customer: ${subscription.customer}`);
        
        if (!subscription.customer) {
          console.error("❌ No customer ID in subscription");
          break;
        }

        // Check if subscription is active
        const isActive = subscription.status === "active" || subscription.status === "trialing";
        const newPlan = isActive ? "premium" : "free";
        const newLimit = isActive ? 10000 : 100;

        const { data: updatedProfile, error: updateError } = await supabase
          .from("profiles")
          .update({
            subscription_plan: newPlan,
            tasks_limit: newLimit,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", subscription.customer)
          .select();

        if (updateError) {
          console.error("❌ Error updating profile:", updateError);
          throw updateError;
        }

        if (!updatedProfile || updatedProfile.length === 0) {
          console.error(`❌ No profile found with stripe_customer_id: ${subscription.customer}`);
        } else {
          console.log(`✅ Updated profile to ${newPlan}:`, updatedProfile[0]);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        console.log(`📝 Processing customer.subscription.deleted for customer: ${subscription.customer}`);
        
        if (!subscription.customer) {
          console.error("❌ No customer ID in subscription");
          break;
        }

        const { data: updatedProfile, error: updateError } = await supabase
          .from("profiles")
          .update({
            subscription_plan: "free",
            tasks_limit: 100,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", subscription.customer)
          .select();

        if (updateError) {
          console.error("❌ Error updating profile:", updateError);
          throw updateError;
        }

        if (!updatedProfile || updatedProfile.length === 0) {
          console.error(`❌ No profile found with stripe_customer_id: ${subscription.customer}`);
        } else {
          console.log(`✅ Updated profile to free:`, updatedProfile[0]);
        }
        break;
      }

      default:
        console.log(`ℹ️ Unhandled event type: ${event.type}`);
    }

    console.log("✅ Webhook processed successfully");
    return new Response(JSON.stringify({ received: true }));
  } catch (error) {
    console.error("Error in stripe-webhook:", error.message);
    return new Response(JSON.stringify({ error: error.message }));
  }
});
