/** Auth errors are public messages; never inspect identities to enumerate accounts. */
export function authErrorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
}

export function authErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = authErrorCode(error);
  if (code === "invalid_credentials")
    return "The email or password didn’t match. Use your original SideBet password, or choose Forgot password to reset it.";
  if (code === "email_not_confirmed")
    return "Confirm your email before logging in. You can request another link below.";
  if (code === "user_already_exists" || /already registered/i.test(message))
    return "Try logging in with your original password, or use Forgot password to reset it.";
  if (code === "over_email_send_rate_limit")
    return "Email requests are temporarily at their limit. Wait a while before trying again. If you already confirmed your email, you can log in now.";
  if (
    code === "over_request_rate_limit" ||
    /only request this after/i.test(message)
  )
    return "Please wait before requesting another email. Use the most recent confirmation link, or log in if you already confirmed.";
  if (/error sending (confirmation|recovery) email/i.test(message))
    return "We couldn’t send the email right now. Please try again later. If your account is already confirmed, you can log in.";
  return message;
}

export function resendWaitSeconds(error: unknown): number {
  const code = authErrorCode(error);
  const message = error instanceof Error ? error.message : String(error);
  if (code === "over_email_send_rate_limit") return 60;
  const seconds = message.match(/only request this after (\d+) seconds?/i);
  if (seconds) return Math.max(1, Number(seconds[1]));
  return code === "over_request_rate_limit" ? 60 : 0;
}
