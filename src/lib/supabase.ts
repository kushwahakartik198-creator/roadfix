import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, validateEnv } from "@/lib/env";

let hasWarned = false;

/**
 * Resets the warning latch. Exported solely for deterministic testing.
 */
export function _resetSupabaseWarning(): void {
  hasWarned = false;
}

/**
 * Creates or resolves a Supabase client instance based on validation.
 * Emits at most ONE console warning if credentials are invalid or missing.
 */
export function initSupabase(customEnv = env): SupabaseClient | null {
  if (customEnv.isValid && customEnv.supabaseUrl && customEnv.supabaseAnonKey) {
    try {
      return createClient(customEnv.supabaseUrl, customEnv.supabaseAnonKey);
    } catch (clientError) {
      if (!hasWarned) {
        const msg = clientError instanceof Error ? clientError.message : String(clientError);
        console.warn(
          `[RoadFix] Failed to initialize Supabase client: ${msg}. Running in offline/stub mode.`
        );
        hasWarned = true;
      }
      return null;
    }
  }

  if (!hasWarned) {
    const errorDetails = customEnv.errors.join("; ");
    console.warn(
      `[RoadFix] Supabase credentials are missing or invalid (${errorDetails || "no credentials provided"}). ` +
        "Operating without backend connectivity (Phase 0 technical foundation)."
    );
    hasWarned = true;
  }

  return null;
}

/**
 * Singleton Supabase client export. Null when valid credentials are not supplied.
 */
export const supabase: SupabaseClient | null = initSupabase();

export { validateEnv };
