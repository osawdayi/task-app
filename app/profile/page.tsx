"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CreditCard, LogOut, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { createBrowserClient } from "@supabase/ssr";

export default function Profile() {
  const { user, isLoading, signOut, session } = useAuth();
  const { manageSubscription } = useSubscription();
  const router = useRouter();
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [subscriptionSuccess, setSubscriptionSuccess] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Refresh user profile data
  const refreshProfile = async () => {
    if (!user?.user_id) return;
    
    setIsRefreshing(true);
    try {
      const [profileResponse, usageResponse] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", user.user_id).single(),
        supabase
          .from("usage_tracking")
          .select("tasks_created")
          .eq("user_id", user.user_id)
          .eq("year_month", new Date().toISOString().slice(0, 7))
          .maybeSingle(),
      ]);

      if (profileResponse.error) throw profileResponse.error;

      // Update the user state by triggering a re-fetch
      // We'll need to reload the page or use a state update mechanism
      window.location.reload();
    } catch (error: any) {
      console.error("Error refreshing profile:", error);
      setSubscriptionError("Failed to refresh profile. Please refresh the page manually.");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Check for success parameter when returning from Stripe
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get("success");
    if (success === "true") {
      setSubscriptionSuccess("Subscription successful! Refreshing your profile...");
      // Clean up URL
      router.replace("/profile");
      // Wait a moment for webhook to process, then refresh
      setTimeout(() => {
        refreshProfile();
      }, 2000);
    }
  }, [router]);

  const handleManageSubscription = async () => {
    if (!session?.access_token) {
      setSubscriptionError("Please sign in again to manage your subscription.");
      return;
    }

    setIsLoadingSubscription(true);
    setSubscriptionError(null);
    try {
      await manageSubscription(session.access_token);
    } catch (error: any) {
      setSubscriptionError(error.message || "Failed to open subscription page. Please try again.");
    } finally {
      setIsLoadingSubscription(false);
    }
  };

  if (isLoading || !user) {
    return <LoadingSkeleton />;
  }

  const isPremium = user.subscription_plan === "premium";
  
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold mb-6">User Profile</h1>
      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p>Name: {user.name}</p>
          <p>Email: {user.email}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p>Current Plan: <span className="font-semibold capitalize">{user.subscription_plan}</span></p>
            <p>
              Tasks Created: {user.tasks_created} / {user.tasks_limit}
            </p>
          </div>
          {subscriptionSuccess && (
            <div className="text-green-600 text-sm bg-green-50 p-2 rounded">
              {subscriptionSuccess}
            </div>
          )}
          {subscriptionError && (
            <div className="text-red-600 text-sm bg-red-50 p-2 rounded">
              {subscriptionError}
            </div>
          )}
          <div className="flex gap-2">
            <Button 
              onClick={handleManageSubscription}
              disabled={isLoadingSubscription || isRefreshing}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              {isLoadingSubscription 
                ? "Loading..." 
                : isPremium 
                  ? "Manage Subscription" 
                  : "Get Premium Subscription"}
            </Button>
            <Button 
              variant="outline"
              onClick={refreshProfile}
              disabled={isRefreshing}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button variant="outline" onClick={signOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
