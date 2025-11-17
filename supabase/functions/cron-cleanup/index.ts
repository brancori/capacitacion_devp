// supabase/functions/cron-cleanup/index.ts

import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Borra registros pendientes con más de 45 días (según manifiesto)
    const { error } = await supabaseAdmin
      .from("pending_registrations")
      .delete()
      .lt("expires_at", new Date().toISOString()); // lt = less than

    if (error) {
      throw error;
    }

    return new Response(
      JSON.stringify({ success: true, message: "Limpieza completada." }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});