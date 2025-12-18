// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import OpenAI from "npm:openai";

// Load environment variables
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const { title, description } = await req.json();

    console.log("🔄 Creating task with AI suggestions...");
    console.log("📋 Received title:", title);
    console.log("📋 Received description:", description);
    console.log("🔑 OPENAI_API_KEY present:", !!OPENAI_API_KEY);
    
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    // Initialize Supabase client
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Get user session
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("No user found");

    // Initialize OpenAI
    const openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });

    // Auto-generate description if not provided
    // Normalize description: convert empty strings, null, undefined to null
    const normalizedDescription = description && typeof description === "string" && description.trim().length > 0
      ? description.trim()
      : null;
    
    // Check if we need to generate a description
    const needsDescription = normalizedDescription === null;
    
    console.log("🔍 Description check:", {
      originalDescription: description,
      normalizedDescription,
      needsDescription,
      hasOpenAIKey: !!OPENAI_API_KEY
    });
    
    let finalDescription = normalizedDescription;
    
    if (needsDescription) {
      if (!OPENAI_API_KEY) {
        console.warn("⚠️ OPENAI_API_KEY not set, skipping description generation");
        finalDescription = null;
      } else {
        try {
          console.log("📝 Auto-generating description for task:", title);
          const descriptionPrompt = `Create a concise one-sentence description for this task: "${title}". The description should be helpful and specific. Reply with only the description sentence, nothing else.`;

          console.log("🤖 Calling OpenAI for description generation...");
          const descriptionCompletion = await openai.chat.completions.create({
            messages: [{ role: "user", content: descriptionPrompt }],
            model: "gpt-4o-mini",
            temperature: 0.5,
            max_tokens: 100,
          });

          const rawDescription = descriptionCompletion.choices[0].message.content;
          console.log("📥 Raw OpenAI response:", rawDescription);
          
          finalDescription = rawDescription?.trim() || null;
          if (finalDescription) {
            console.log(`✨ AI Generated Description: ${finalDescription}`);
          } else {
            console.warn("⚠️ OpenAI returned empty or null description");
          }
        } catch (error: any) {
          console.error("❌ Error generating description:", error.message);
          console.error("❌ Error stack:", error.stack);
          console.error("❌ Full error object:", JSON.stringify(error, null, 2));
          // Continue without description if AI fails
          finalDescription = null;
        }
      }
    } else {
      console.log("✅ Using provided description:", finalDescription);
    }
    
    console.log("📝 Final description to use:", finalDescription);

    // Create the task
    const { data, error } = await supabaseClient
      .from("tasks")
      .insert({
        title,
        description: finalDescription,
        completed: false,
        user_id: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    // Get label suggestion from OpenAI
    const descriptionText = finalDescription || "no description provided";
    const prompt = `Based on this task title: "${title}" and description: "${descriptionText}", suggest ONE of these labels: work, personal, priority, shopping, home. Reply with just the label word and nothing else.`;

    const completion = await openai.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 16,
    });

    const suggestedLabel = completion.choices[0].message.content
      ?.toLowerCase()
      .trim();

    console.log(`✨ AI Suggested Label: ${suggestedLabel}`);

    // Validate the label
    const validLabels = ["work", "personal", "priority", "shopping", "home"];
    const label = validLabels.includes(suggestedLabel) ? suggestedLabel : null;

    // Update the task with the suggested label
    const { data: updatedTask, error: updateError } = await supabaseClient
      .from("tasks")
      .update({ label })
      .eq("task_id", data.task_id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Update dashboard_last_modified timestamp (trigger should handle this, but doing it explicitly for safety)
    await supabaseClient
      .from("profiles")
      .update({ dashboard_last_modified: new Date().toISOString() })
      .eq("user_id", user.id);

    return new Response(JSON.stringify(updatedTask), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Error in create-task-with-ai:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
