import { describe, it, expect } from "vitest";
import { validateEnv } from "@/lib/env";

describe("src/lib/env.ts - Environment variable validation", () => {
  it("reports invalid when both variables are missing and does not throw", () => {
    const result = validateEnv({});
    expect(result.isValid).toBe(false);
    expect(result.supabaseUrl).toBeUndefined();
    expect(result.supabaseAnonKey).toBeUndefined();
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.errors.some((e) => e.includes("VITE_SUPABASE_URL"))).toBe(true);
    expect(result.errors.some((e) => e.includes("VITE_SUPABASE_ANON_KEY"))).toBe(true);
  });

  it("handles undefined/null source gracefully without throwing", () => {
    // @ts-expect-error testing invalid type robustness
    const resultFromNull = validateEnv(null);
    expect(resultFromNull.isValid).toBe(false);
    expect(resultFromNull.errors.length).toBeGreaterThanOrEqual(1);

    const resultFromUndefined = validateEnv(undefined);
    expect(typeof resultFromUndefined.isValid).toBe("boolean");
  });

  it("reports invalid when only VITE_SUPABASE_URL is provided", () => {
    const result = validateEnv({
      VITE_SUPABASE_URL: "https://example.invalid",
    });
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("VITE_SUPABASE_ANON_KEY"))).toBe(true);
  });

  it("reports invalid when only VITE_SUPABASE_ANON_KEY is provided", () => {
    const result = validateEnv({
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
    });
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("VITE_SUPABASE_URL"))).toBe(true);
  });

  it("reports invalid when VITE_SUPABASE_URL is malformed", () => {
    const result = validateEnv({
      VITE_SUPABASE_URL: "not-a-valid-url-format",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
    });
    expect(result.isValid).toBe(false);
    expect(result.supabaseUrl).toBeUndefined();
    expect(result.errors.some((e) => e.includes("malformed"))).toBe(true);
  });

  it("reports invalid when VITE_SUPABASE_URL uses unsupported protocol", () => {
    const result = validateEnv({
      VITE_SUPABASE_URL: "ftp://example.invalid/path",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
    });
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("protocol"))).toBe(true);
  });

  it("reports invalid when environment values are whitespace only", () => {
    const result = validateEnv({
      VITE_SUPABASE_URL: "   ",
      VITE_SUPABASE_ANON_KEY: "   ",
    });
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("reports valid when valid URL and anon key are provided", () => {
    const fakeUrl = "https://example.invalid";
    const fakeKey = "test-anon-key-abc-123";

    const result = validateEnv({
      VITE_SUPABASE_URL: fakeUrl,
      VITE_SUPABASE_ANON_KEY: fakeKey,
    });

    expect(result.isValid).toBe(true);
    expect(result.supabaseUrl).toBe(fakeUrl);
    expect(result.supabaseAnonKey).toBe(fakeKey);
    expect(result.errors).toEqual([]);
  });
});
