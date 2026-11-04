export interface LoginCodeMessage {
  to: string;
  code: string;
  /** Demo logs the code and does not call the network. */
  demo: boolean;
  apiKey?: string;
  from?: string;
}

/**
 * Sign-in code delivery. Demo mode logs the code and nothing else — never the
 * address. Live mode is Resend, and it fails closed when the key or the
 * operator-chosen From address is missing. The message names no circle and
 * carries no link.
 */
export async function deliverLoginCode(
  input: LoginCodeMessage,
  http: typeof fetch = fetch,
): Promise<boolean> {
  if (!/^\d{6}$/.test(input.code)) return false;
  if (input.demo) {
    console.log("otp_demo_code_issued", { code: input.code });
    return true;
  }
  if (!input.apiKey || !input.from) {
    console.error("otp_send_failed", { reason: "missing_mail_config" });
    return false;
  }
  const text = [
    `Your Piñata sign-in code is ${input.code}.`,
    "It expires in ten minutes.",
    "If you did not ask for this, ignore this message.",
  ].join("\n");
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await http("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: input.from,
          to: [input.to],
          subject: "Your sign-in code",
          text,
        }),
        redirect: "error",
        signal: controller.signal,
      });
      await response.arrayBuffer().catch(() => undefined);
      return response.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}
