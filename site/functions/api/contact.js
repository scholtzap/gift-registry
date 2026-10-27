/**
 * Piñata contact form (gifts.scholtz.work), from the scholtz-site-footer template.
 *
 * Delivery (first match wins):
 * 1. CONTACT_WEBHOOK_URL (+ optional CONTACT_WEBHOOK_TOKEN)
 * 2. RESEND_API_KEY → CONTACT_TO_EMAIL
 * 3. mailto fallback for the client
 */
const MAX = {
  name: 120,
  email: 160,
  topic: 64,
  message: 4000,
};

const CONTACT_TO_DEFAULT = "scholtzap@gmail.com";

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed =
    !origin ||
    origin.endsWith(".pages.dev") ||
    origin === "https://gifts.scholtz.work" ||
    origin === "http://127.0.0.1:8788" ||
    origin === "http://localhost:8788";
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": allowed ? origin || "*" : "null",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function json(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(request),
  });
}

function clip(value, max) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(context.request),
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json(request, { ok: false, error: "invalid_json" }, 400);
  }

  // Honeypot — bots fill this; humans never see it.
  if (clip(payload?.website, 80)) {
    return json(request, { ok: true, via: "honeypot" });
  }

  const name = clip(payload?.name, MAX.name);
  const email = clip(payload?.email, MAX.email).toLowerCase();
  const topic = clip(payload?.topic, MAX.topic) || "general";
  const message = clip(payload?.message, MAX.message);

  if (!email || !message) {
    return json(request, { ok: false, error: "missing_fields" }, 400);
  }
  if (!isEmail(email)) {
    return json(request, { ok: false, error: "invalid_email" }, 400);
  }
  if (message.length < 4) {
    return json(request, { ok: false, error: "message_too_short" }, 400);
  }

  const record = {
    name,
    email,
    topic,
    message,
    path: clip(payload?.path, 160) || "/",
    source: clip(payload?.source, 120) || "pinata-site",
    received_at: new Date().toISOString(),
  };

  const to = env.CONTACT_TO_EMAIL || CONTACT_TO_DEFAULT;
  const subject = `[Piñata contact] ${topic}${name ? ` (${name})` : ""}`;
  const text = [
    name ? `Name: ${name}` : null,
    `Email: ${email}`,
    `Topic: ${topic}`,
    `Path: ${record.path}`,
    `Source: ${record.source}`,
    "",
    message,
  ]
    .filter(Boolean)
    .join("\n");

  const webhook = env.CONTACT_WEBHOOK_URL;
  if (typeof webhook === "string" && webhook.startsWith("https://")) {
    const token = env.CONTACT_WEBHOOK_TOKEN;
    const body =
      typeof token === "string" && token.length > 8
        ? { ...record, token }
        : record;
    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        return json(request, { ok: true, via: "webhook" });
      }
    } catch {
      /* fall through */
    }
  }

  const resendKey = env.RESEND_API_KEY;
  if (typeof resendKey === "string" && resendKey.length > 8) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${resendKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from:
            env.CONTACT_FROM_EMAIL ||
            "Piñata <onboarding@resend.dev>",
          to: [to],
          reply_to: email,
          subject,
          text,
        }),
      });
      if (res.ok) {
        return json(request, { ok: true, via: "resend" });
      }
    } catch {
      /* fall through */
    }
  }

  return json(request, {
    ok: false,
    fallback: "mailto",
    mailto: {
      to,
      subject: `Piñata enquiry (${topic})${name ? `, ${name}` : ""}`,
      body: text,
    },
  });
}
