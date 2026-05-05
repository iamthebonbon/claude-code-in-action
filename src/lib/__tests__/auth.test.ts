import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockSet = vi.fn();
const mockGet = vi.fn();
const mockDelete = vi.fn();
const mockCookieStore = { set: mockSet, get: mockGet, delete: mockDelete };

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}));

const mockSign = vi.fn();
const mockSetProtectedHeader = vi.fn();
const mockSetExpirationTime = vi.fn();
const mockSetIssuedAt = vi.fn();

vi.mock("jose", () => ({
  SignJWT: vi.fn().mockImplementation(() => ({
    setProtectedHeader: mockSetProtectedHeader.mockReturnThis(),
    setExpirationTime: mockSetExpirationTime.mockReturnThis(),
    setIssuedAt: mockSetIssuedAt.mockReturnThis(),
    sign: mockSign,
  })),
  jwtVerify: vi.fn(),
}));

import { createSession, getSession, deleteSession, verifySession } from "@/lib/auth";
import { jwtVerify } from "jose";
import { NextRequest } from "next/server";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createSession", () => {
  test("signs a JWT and sets an httpOnly cookie", async () => {
    mockSign.mockResolvedValue("signed-token");

    await createSession("user-123", "user@example.com");

    expect(mockSign).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      "auth-token",
      "signed-token",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      })
    );
  });

  test("sets cookie expiry ~7 days from now", async () => {
    mockSign.mockResolvedValue("signed-token");
    const before = Date.now();

    await createSession("user-1", "a@b.com");

    const after = Date.now();
    const { expires } = mockSet.mock.calls[0][2] as { expires: Date };
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    expect(expires.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
    expect(expires.getTime()).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
  });
});

describe("getSession", () => {
  test("returns null when no cookie is present", async () => {
    mockGet.mockReturnValue(undefined);

    const session = await getSession();

    expect(session).toBeNull();
  });

  test("returns session payload for a valid token", async () => {
    const payload = { userId: "user-1", email: "a@b.com", expiresAt: new Date() };
    mockGet.mockReturnValue({ value: "valid-token" });
    vi.mocked(jwtVerify).mockResolvedValue({ payload } as never);

    const session = await getSession();

    expect(jwtVerify).toHaveBeenCalledWith("valid-token", expect.anything());
    expect(session).toEqual(payload);
  });

  test("returns null when token verification fails", async () => {
    mockGet.mockReturnValue({ value: "bad-token" });
    vi.mocked(jwtVerify).mockRejectedValue(new Error("invalid"));

    const session = await getSession();

    expect(session).toBeNull();
  });
});

describe("deleteSession", () => {
  test("deletes the auth-token cookie", async () => {
    await deleteSession();

    expect(mockDelete).toHaveBeenCalledWith("auth-token");
  });
});

describe("verifySession", () => {
  test("returns null when no cookie on request", async () => {
    const request = new NextRequest("http://localhost/api/test");

    const session = await verifySession(request);

    expect(session).toBeNull();
  });

  test("returns session payload for a valid request cookie", async () => {
    const payload = { userId: "user-1", email: "a@b.com", expiresAt: new Date() };
    vi.mocked(jwtVerify).mockResolvedValue({ payload } as never);

    const request = new NextRequest("http://localhost/api/test", {
      headers: { cookie: "auth-token=valid-token" },
    });

    const session = await verifySession(request);

    expect(jwtVerify).toHaveBeenCalledWith("valid-token", expect.anything());
    expect(session).toEqual(payload);
  });

  test("returns null when request token is invalid", async () => {
    vi.mocked(jwtVerify).mockRejectedValue(new Error("expired"));

    const request = new NextRequest("http://localhost/api/test", {
      headers: { cookie: "auth-token=expired-token" },
    });

    const session = await verifySession(request);

    expect(session).toBeNull();
  });
});
