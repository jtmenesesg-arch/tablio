import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import {
  requireAuthenticatedTenantClient,
  statusForPostgrestError,
} from "./route-handler-client";

describe("requireAuthenticatedTenantClient", () => {
  it("returns 401 when there is no session", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as never);

    const result = await requireAuthenticatedTenantClient();

    expect(result.status).toBe(401);
    expect(result.supabase).toBeNull();
  });

  it("returns the client when a real user is present", async () => {
    const fakeClient = {
      auth: {
        getUser: async () => ({ data: { user: { id: "user-1" } } }),
      },
    };
    vi.mocked(createClient).mockResolvedValue(fakeClient as never);

    const result = await requireAuthenticatedTenantClient();

    expect(result.status).toBeNull();
    expect(result.supabase).toBe(fakeClient);
  });
});

describe("statusForPostgrestError", () => {
  it("maps 42501 (insufficient_privilege) to 403", () => {
    expect(statusForPostgrestError({ code: "42501" })).toBe(403);
  });

  it("maps null (no error) to 500 — callers should not call this without an error", () => {
    expect(statusForPostgrestError(null)).toBe(500);
  });

  it("maps any other Postgres error code to 500", () => {
    expect(statusForPostgrestError({ code: "23505" })).toBe(500);
  });
});
