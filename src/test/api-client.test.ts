import { afterEach, describe, expect, it, vi } from "vitest";
import { api, setCsrfToken } from "@/lib/api";

describe("API client auth transport", () => {
  afterEach(() => {
    setCsrfToken(null);
    vi.restoreAllMocks();
  });
  it("sends cookie credentials and the session CSRF token on mutations", async () => {
    setCsrfToken("csrf-example-token");
    const mockFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, data: { loggedOut: true } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    await expect(api.logout()).resolves.toEqual({ loggedOut: true });
    const [, init] = mockFetch.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(init?.credentials).toBe("include");
    expect(init?.method).toBe("POST");
    expect(headers.get("X-CSRF-Token")).toBe("csrf-example-token");
  });
});
