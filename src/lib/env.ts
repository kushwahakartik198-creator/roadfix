import type { EnvValidationResult } from "@/types";

/**
 * Validates Supabase environment variables.
 * Safe function that never throws under any circumstance.
 *
 * @param source Optional key-value record to validate. Defaults to `import.meta.env`.
 * @returns EnvValidationResult containing validation status, sanitized values, and error list.
 */
export function validateEnv(source?: Record<string, unknown>): EnvValidationResult {
  const errors: string[] = [];

  try {
    const rawEnv =
      source ?? (typeof import.meta !== "undefined" ? import.meta.env : undefined) ?? {};

    const rawUrl = rawEnv["VITE_SUPABASE_URL"];
    const rawAnonKey = rawEnv["VITE_SUPABASE_ANON_KEY"];

    let validUrl: string | undefined;
    let validKey: string | undefined;

    // Validate VITE_SUPABASE_URL
    if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
      errors.push("VITE_SUPABASE_URL is missing or empty.");
    } else {
      const trimmedUrl = rawUrl.trim();
      try {
        const parsed = new URL(trimmedUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          errors.push(
            `VITE_SUPABASE_URL must use http or https protocol: received "${parsed.protocol}".`
          );
        } else {
          validUrl = trimmedUrl;
        }
      } catch {
        errors.push(
          `VITE_SUPABASE_URL is malformed: "${trimmedUrl}" cannot be parsed as a valid URL.`
        );
      }
    }

    // Validate VITE_SUPABASE_ANON_KEY
    if (typeof rawAnonKey !== "string" || rawAnonKey.trim().length === 0) {
      errors.push("VITE_SUPABASE_ANON_KEY is missing or empty.");
    } else {
      validKey = rawAnonKey.trim();
    }

    const isValid = errors.length === 0 && Boolean(validUrl) && Boolean(validKey);

    return {
      isValid,
      supabaseUrl: isValid ? validUrl : undefined,
      supabaseAnonKey: isValid ? validKey : undefined,
      errors,
    };
  } catch (unexpectedError) {
    // Fail-safe: ensure function NEVER throws
    const message =
      unexpectedError instanceof Error ? unexpectedError.message : String(unexpectedError);
    return {
      isValid: false,
      errors: [`Unexpected error during environment validation: ${message}`],
    };
  }
}

/**
 * Global validated environment result for the running application.
 */
export const env = validateEnv();
