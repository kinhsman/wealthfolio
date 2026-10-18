import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GOOGLE_SIGN_IN_URL, LoginPage } from "./login-page";

const useAuthMock = vi.hoisted(() => vi.fn());

vi.mock("@/context/auth-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/context/auth-context")>();
  return { ...actual, useAuth: useAuthMock };
});

function auth(overrides: object = {}) {
  return {
    requiresAuth: true,
    requiresPassword: true,
    oidcEnabled: false,
    isAuthenticated: false,
    statusLoading: false,
    loginLoading: false,
    loginError: null,
    login: vi.fn(),
    logout: vi.fn(),
    clearError: vi.fn(),
    ...overrides,
  };
}

describe("LoginPage (Google only)", () => {
  it("offers Continue with Google and no password box, even though the server still has a password", () => {
    useAuthMock.mockReturnValue(auth());
    render(<LoginPage />);

    const google = screen.getByRole("link", { name: "Continue with Google" });
    expect(google).toHaveAttribute("href", GOOGLE_SIGN_IN_URL);
    expect(GOOGLE_SIGN_IN_URL).toBe("/api/money-hub/auth/google");
    expect(screen.queryByTestId("login-password-input")).not.toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it("shows why the last Google sign-in did not work", () => {
    useAuthMock.mockReturnValue(
      auth({ loginError: "Your account is not allowed to access this instance." }),
    );
    render(<LoginPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("not allowed");
  });
});
