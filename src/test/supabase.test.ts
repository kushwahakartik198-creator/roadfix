import { describe, it, expect, vi, beforeEach } from "vitest";
import { supabase, initSupabase, _resetSupabaseWarning } from "@/lib/supabase";

describe("src/lib/supabase.ts - Supabase client initialization", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _resetSupabaseWarning();
  });

  it("exports null when credentials are missing or invalid in current environment", () => {
    // In Phase 0 with no .env file, default exported supabase must be null
    expect(supabase).toBeNull();
  });

  it("warns at most once across multiple initialization attempts with missing credentials", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // First call should warn
    const client1 = initSupabase({
      isValid: false,
      errors: ["VITE_SUPABASE_URL is missing or empty."],
    });
    expect(client1).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[RoadFix] Supabase credentials are missing or invalid")
    );

    // Subsequent calls (simulating React StrictMode re-renders / HMR) must NOT warn again
    const client2 = initSupabase({
      isValid: false,
      errors: ["VITE_SUPABASE_URL is missing or empty."],
    });
    expect(client2).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    const client3 = initSupabase({
      isValid: false,
      errors: ["VITE_SUPABASE_ANON_KEY is missing or empty."],
    });
    expect(client3).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("successfully creates a Supabase client when valid credentials are provided", () => {
    const validEnv = {
      isValid: true,
      supabaseUrl: "https://example.invalid",
      supabaseAnonKey: "fake-test-anon-key-phase0",
      errors: [],
    };

    const client = initSupabase(validEnv);
    expect(client).not.toBeNull();
    expect(typeof client?.from).toBe("function");
    expect(typeof client?.auth).toBe("object");
  });
});
