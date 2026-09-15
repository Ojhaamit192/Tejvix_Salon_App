const twilio = require("twilio");

/**
 * Sends an SMS through Twilio.
 * If Twilio env vars aren't set yet, it just logs to the function log
 * instead of failing — handy for testing the app before Twilio is configured.
 */
async function sendSms(to, body) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = process.env;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    console.log(`[DEV MODE - SMS not sent] To: ${to} | ${body}`);
    return;
  }

  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  try {
    await client.messages.create({ body, from: TWILIO_FROM_NUMBER, to });
  } catch (err) {
    console.error("Twilio error:", err.message);
  }
}

module.exports = { sendSms };
