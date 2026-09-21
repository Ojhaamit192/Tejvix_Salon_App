/**
 * Sends an SMS through Fast2SMS (India-focused SMS provider — no A2P
 * registration, no sandbox/opt-in step, works on any Indian mobile number).
 *
 * Sign up at fast2sms.com, go to Dev API (fast2sms.com/dashboard/dev-api)
 * to get your API key, and set it as FAST2SMS_API_KEY in your environment.
 * New accounts get some free SMS credit to test with.
 *
 * If FAST2SMS_API_KEY isn't set yet, this just logs to the function log
 * instead of failing — handy for testing the app before SMS is configured.
 *
 * Every send attempt (including dev-mode "skips") is logged to the
 * sms_logs table, so the owner dashboard can report total SMS sent.
 */
async function sendSms(to, body, salonId) {
  const apiKey = process.env.FAST2SMS_API_KEY;

  if (!apiKey) {
    console.log(`[DEV MODE - SMS not sent] To: ${to} | ${body}`);
    await logSms(to, body, salonId, "dev_mode");
    return;
  }

  const cleanNumber = to.replace(/^\+?91/, "").replace(/\D/g, "");

  const params = new URLSearchParams({
    authorization: apiKey,
    message: body,
    language: "english",
    route: "q", // Quick SMS route — no DLT registration needed
    numbers: cleanNumber,
  });

  let status = "sent";
  try {
    const res = await fetch(`https://www.fast2sms.com/dev/bulkV2?${params.toString()}`, {
      method: "GET",
      headers: { "cache-control": "no-cache" },
    });
    const data = await res.json();
    if (!data.return) {
      console.error("Fast2SMS did not accept the message:", data);
      status = "failed";
    }
  } catch (err) {
    console.error("Fast2SMS request failed:", err.message);
    status = "failed";
  }

  await logSms(to, body, salonId, status);
}

// Best-effort logging — if this fails (e.g. migration_6 not run yet), it
// should never block or break the actual SMS send above.
async function logSms(to, body, salonId, status) {
  try {
    const { getSupabase } = require("./_supabase");
    const supabase = getSupabase();
    await supabase.from("sms_logs").insert({
      salon_id: salonId || null,
      phone: to,
      message: body,
      status,
    });
  } catch (err) {
    console.error("sms_logs insert skipped:", err.message);
  }
}

module.exports = { sendSms };
