(() => {
  const CONTACT_TO = "scholtzap@gmail.com";

  function openMailto(mailto) {
    const to = mailto?.to || CONTACT_TO;
    const subject = encodeURIComponent(mailto?.subject || "Piñata enquiry");
    const body = encodeURIComponent(mailto?.body || "");
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  }

  async function submitContact(payload) {
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });

    let data = {};
    try {
      data = await res.json();
    } catch {
      /* ignore */
    }

    if (res.ok && data?.ok) {
      return { ok: true, via: data.via || "api" };
    }

    if (data?.fallback === "mailto" && data?.mailto) {
      openMailto(data.mailto);
      return { ok: true, via: "mailto" };
    }

    throw new Error(data?.error || `Contact failed (${res.status})`);
  }

  function bindForm(form, statusEl) {
    if (!form || !statusEl) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const name = (form.querySelector("#contact-name")?.value || "").trim();
      const email = (form.querySelector("#contact-email")?.value || "")
        .trim()
        .toLowerCase();
      const topic = (form.querySelector("#contact-topic")?.value || "general").trim();
      const message = (form.querySelector("#contact-message")?.value || "").trim();
      const website = (form.querySelector("#website")?.value || "").trim();

      statusEl.hidden = false;
      statusEl.classList.remove("ok", "err");

      const emailInput = form.querySelector("#contact-email");
      if (!emailInput?.checkValidity() || !email) {
        statusEl.classList.add("err");
        statusEl.textContent = "Enter a valid email so we can reply.";
        emailInput?.focus();
        return;
      }

      if (message.length < 4) {
        statusEl.classList.add("err");
        statusEl.textContent = "Add a short message (a few words is enough).";
        form.querySelector("#contact-message")?.focus();
        return;
      }

      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;

      try {
        const result = await submitContact({
          name,
          email,
          topic,
          message,
          website,
          path: "/",
          source: "pinata-site",
        });
        statusEl.classList.add("ok");
        statusEl.textContent =
          result.via === "mailto"
            ? "Opening your email app…"
            : "Message sent. We will reply by email.";
        form.reset();
        const topicSelect = form.querySelector("#contact-topic");
        if (topicSelect) topicSelect.value = "early-access";
      } catch (err) {
        statusEl.classList.add("err");
        statusEl.textContent = `Could not send. Email ${CONTACT_TO} instead.`;
        console.warn(err);
      } finally {
        if (button) button.disabled = false;
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindForm(
      document.getElementById("contact-form"),
      document.getElementById("contact-status")
    );
  });
})();
