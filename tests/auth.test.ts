import { describe, expect, it } from "vitest";
import { authErrorMessage, resendWaitSeconds } from "../src/auth";

const authError = (code: string, message: string) =>
  Object.assign(new Error(message), { code });

describe("confirmation recovery", () => {
  it("explains invalid credentials without claiming the account does not exist", () => {
    const message = authErrorMessage(
      authError("invalid_credentials", "Invalid login credentials"),
    );
    expect(message).toContain("Forgot password");
    expect(message).not.toContain("does not exist");
  });
  it("directs an existing account to login instead of promising another email", () => {
    const message = authErrorMessage(
      authError("user_already_exists", "User already registered"),
    );
    expect(message).toContain("logging in");
    expect(message).toContain("original password");
    expect(message).not.toContain("Check your email");
  });
  it("provides a resend path for an unconfirmed login", () => {
    expect(
      authErrorMessage(authError("email_not_confirmed", "Email not confirmed")),
    ).toContain("request another link");
  });
  it("uses the server cooldown instead of immediately retrying", () => {
    expect(
      resendWaitSeconds(
        authError(
          "over_request_rate_limit",
          "For security purposes, you can only request this after 37 seconds.",
        ),
      ),
    ).toBe(37);
  });
  it("backs off rate limits even when the server omits a duration", () => {
    expect(
      resendWaitSeconds(
        authError("over_request_rate_limit", "Too many requests"),
      ),
    ).toBe(60);
    expect(
      resendWaitSeconds(
        authError("over_email_send_rate_limit", "Email rate limit exceeded"),
      ),
    ).toBe(60);
  });
  it("does not say SMTP failure means the recipient received an email", () => {
    expect(
      authErrorMessage(new Error("Error sending confirmation email")),
    ).toContain("couldn’t send");
  });
  it("preserves other server errors without treating them as email rate limits", () => {
    const error = new Error("Invalid login credentials");
    expect(authErrorMessage(error)).toBe("Invalid login credentials");
    expect(resendWaitSeconds(error)).toBe(0);
  });
});
