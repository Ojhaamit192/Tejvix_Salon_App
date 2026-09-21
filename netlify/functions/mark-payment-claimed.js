const { CORS_HEADERS } = require("./_shared");
const { getSupabase } = require("./_supabase");

// Customer taps "I have completed the payment" after scanning the salon's
// UPI QR. This just records that claim — it is NOT a verified payment like
// a gateway would give (that's what Razorpay is for, once set up). It's a
// simple, honesty-based interim solution.
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch {
    data = {};
  }

  const tokenId = (data.token_id || "").trim();
  const paymentRef = (data.payment_ref || "").trim();
  if (!tokenId) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "token_id is required" }) };
  }

  const supabase = getSupabase();

  const { data: updated, error } = await supabase
    .from("tokens")
    .update({ payment_status: "claimed", payment_ref: paymentRef || null })
    .eq("id", tokenId)
    .eq("payment_status", "pending")
    .select("id")
    .single();

  if (error || !updated) {
    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: "Booking not found or already confirmed" }) };
  }

  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: true }) };
};
