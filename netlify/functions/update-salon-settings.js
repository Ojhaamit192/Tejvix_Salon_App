const { CORS_HEADERS } = require("./_shared");
const { getSupabase } = require("./_supabase");

// PIN-protected: lets staff toggle Happy Hours and Mock/Real SMS mode
// from the admin panel, without needing to touch Supabase directly.
// Body: { salon, pin, happy_hours_enabled?, happy_hours_discount_percent?, sms_mode? }
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

  const salonSlug = (data.salon || "").trim();
  const pin = (data.pin || "").trim();
  if (!salonSlug || !pin) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "salon and pin are required" }) };
  }

  const supabase = getSupabase();

  const { data: salon, error: salonErr } = await supabase
    .from("salons")
    .select("id, admin_pin")
    .eq("slug", salonSlug)
    .single();
  if (salonErr || !salon) {
    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: "Salon not found" }) };
  }
  if (pin !== salon.admin_pin) {
    return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: "Incorrect PIN" }) };
  }

  const updates = {};
  if (typeof data.happy_hours_enabled === "boolean") updates.happy_hours_enabled = data.happy_hours_enabled;
  if (data.happy_hours_discount_percent !== undefined) updates.happy_hours_discount_percent = Number(data.happy_hours_discount_percent);
  if (data.sms_mode === "real" || data.sms_mode === "mock") updates.sms_mode = data.sms_mode;

  if (!Object.keys(updates).length) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Nothing to update" }) };
  }

  const { error: updateErr } = await supabase.from("salons").update(updates).eq("id", salon.id);
  if (updateErr) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: updateErr.message }) };
  }

  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: true, updated: updates }) };
};
