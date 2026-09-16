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
 */
async function sendSms(to, body) {
  const apiKey = process.env.FAST2SMS_API_KEY;

  if (!apiKey) {
    console.log(`[DEV MODE - SMS not sent] To: ${to} | ${body}`);
    return;
  }

  // Fast2SMS expects a plain 10-digit Indian mobile number (no +91 / 0 prefix).
  const cleanNumber = to.replace(/^\+?91/, "").replace(/\D/g, "");

  const params = new URLSearchParams({
    authorization: apiKey,
    message: body,
    language: "english",
    route: "q", // Quick SMS route — no DLT registration needed
    numbers: cleanNumber,
  });

  try {
    const res = await fetch(`https://www.fast2sms.com/dev/bulkV2?${params.toString()}`, {
      method: "GET",
      headers: { "cache-control": "no-cache" },
    });
    const data = await res.json();
    if (!data.return) {
      console.error("Fast2SMS did not accept the message:", data);
    }
  } catch (err) {
    console.error("Fast2SMS request failed:", err.message);
  }
}

module.exports = { sendSms };
