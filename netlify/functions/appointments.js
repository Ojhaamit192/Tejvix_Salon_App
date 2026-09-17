const { CORS_HEADERS } = require("./_shared");
const { getSupabase, todayDate } = require("./_supabase");

// GET ?salon=slug&pin=1234 -> today's scheduled (not yet checked-in) appointments.
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  const params = event.queryStringParameters || {};
  const salonSlug = params.salon || "";
  const pin = params.pin || "";

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

  const { data, error } = await supabase
    .from("tokens")
    .select("id, name, phone, scheduled_at, staff_id, services(name), staff(name)")
    .eq("salon_id", salon.id)
    .eq("status", "scheduled")
    .order("scheduled_at");

  if (error) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: error.message }) };
  }

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      appointments: (data || []).map((a) => ({
        id: a.id,
        name: a.name,
        service: a.services ? a.services.name : "",
        staff: a.staff ? a.staff.name : "",
        scheduled_at: a.scheduled_at,
      })),
    }),
  };
};
