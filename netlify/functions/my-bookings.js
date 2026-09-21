const { CORS_HEADERS } = require("./_shared");
const { getSupabase } = require("./_supabase");

// GET ?phone=9876543210 -> every booking (any salon) under that phone
// number, newest first. No login needed — the phone number is the lookup key.
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  const phone = ((event.queryStringParameters && event.queryStringParameters.phone) || "").trim();
  if (!phone) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "phone query param is required" }) };
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("tokens")
    .select("id, seq, status, booking_type, scheduled_at, payment_status, created_at, cart_items, staff_id, salons(name, slug), services(name, price), staff(name)")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: error.message }) };
  }

  const bookings = (data || []).map((t) => ({
    id: t.id,
    token: t.booking_type === "walkin" ? `T${t.seq}` : null,
    status: t.status,
    booking_type: t.booking_type,
    scheduled_at: t.scheduled_at,
    payment_status: t.payment_status,
    created_at: t.created_at,
    salon_name: t.salons ? t.salons.name : "",
    salon_slug: t.salons ? t.salons.slug : "",
    service_name: t.services ? t.services.name : "",
    service_price: t.services ? t.services.price : null,
    staff_name: t.staff ? t.staff.name : "",
    staff_id: t.staff_id,
    cart_items: t.cart_items || null,
  }));

  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ bookings }) };
};
