const crypto = require("crypto");
const { CORS_HEADERS } = require("./_shared");
const { getSupabase, todayDate } = require("./_supabase");
const { sendSms } = require("./_sms");

// Called right after Razorpay's checkout succeeds on the browser.
// Verifies the payment is genuine (server-side signature check — never
// trust the browser alone for this), THEN creates the appointment.
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature,
//         salon, name, phone, service_id, staff_id, scheduled_at }
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

  const {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
    salon: salonSlug,
    name,
    phone,
    service_id: serviceId,
    scheduled_at: scheduledAt,
  } = data;
  let staffId = (data.staff_id || "").trim();

  if (!orderId || !paymentId || !signature) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Payment details are required" }) };
  }
  if (!salonSlug || !name || !phone || !serviceId || !scheduledAt) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Booking details are required" }) };
  }

  const { RAZORPAY_KEY_SECRET } = process.env;
  if (!RAZORPAY_KEY_SECRET) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Razorpay is not configured yet" }) };
  }

  const expectedSignature = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  if (expectedSignature !== signature) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Payment verification failed" }) };
  }

  // Payment is genuine — now actually create the appointment.
  const supabase = getSupabase();

  const { data: salon, error: salonErr } = await supabase
    .from("salons")
    .select("id, name")
    .eq("slug", salonSlug)
    .single();
  if (salonErr || !salon) {
    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: "Salon not found" }) };
  }

  const { data: service, error: serviceErr } = await supabase
    .from("services")
    .select("id, name, price")
    .eq("id", serviceId)
    .eq("salon_id", salon.id)
    .single();
  if (serviceErr || !service) {
    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: "Service not found" }) };
  }

  if (!staffId) {
    const { data: firstStaff } = await supabase
      .from("staff")
      .select("id")
      .eq("salon_id", salon.id)
      .eq("is_active", true)
      .order("name")
      .limit(1)
      .single();
    if (firstStaff) staffId = firstStaff.id;
  }

  const { error: insertErr } = await supabase.from("tokens").insert({
    salon_id: salon.id,
    day: todayDate(),
    seq: 0,
    name,
    phone,
    service_id: service.id,
    staff_id: staffId || null,
    status: "scheduled",
    booking_type: "appointment",
    scheduled_at: scheduledAt,
    payment_status: "paid",
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
  });
  if (insertErr) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: insertErr.message }) };
  }

  const when = new Date(scheduledAt).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
  });
  await sendSms(
    phone,
    `${salon.name}: Payment of ₹${service.price} received. Your appointment for ${service.name} on ${when} is confirmed.`
  );

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({ ok: true, scheduled_at: scheduledAt, service: service.name }),
  };
};
