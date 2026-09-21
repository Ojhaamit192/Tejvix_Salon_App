const { CORS_HEADERS } = require("./_shared");
const { getSupabase } = require("./_supabase");

// Creates a Razorpay order for an advance-payment appointment booking.
// Body: { amount: <rupees>, salon, phone }
// The Key Secret never leaves this function — only the public Key ID
// (safe to expose) goes back to the browser, along with the order_id.
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Razorpay is not configured yet" }) };
  }

  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch {
    data = {};
  }

  const amountRupees = Number(data.amount);
  if (!amountRupees || amountRupees <= 0) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "A valid amount is required" }) };
  }

  // Check BEFORE taking any payment — one active booking per phone, per
  // salon. No point charging a customer's card only to reject the booking
  // afterward.
  const salonSlug = (data.salon || "").trim();
  const phone = (data.phone || "").trim();
  if (salonSlug && phone) {
    const supabase = getSupabase();
    const { data: salon } = await supabase.from("salons").select("id").eq("slug", salonSlug).single();
    if (salon) {
      const { data: existingActive } = await supabase
        .from("tokens")
        .select("id")
        .eq("salon_id", salon.id)
        .eq("phone", phone)
        .in("status", ["waiting", "serving", "scheduled"])
        .maybeSingle();
      if (existingActive) {
        return {
          statusCode: 409,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: "You already have an active booking at this salon." }),
        };
      }
    }
  }

  const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");

  try {
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        amount: Math.round(amountRupees * 100), // Razorpay wants paise
        currency: "INR",
        receipt: `appt_${Date.now()}`,
        payment_capture: 1,
      }),
    });
    const order = await res.json();

    if (!res.ok) {
      const message = (order && order.error && order.error.description) || "Razorpay order creation failed";
      return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: message }) };
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        key_id: RAZORPAY_KEY_ID,
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
