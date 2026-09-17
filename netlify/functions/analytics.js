const { CORS_HEADERS } = require("./_shared");
const { getSupabase, todayDate } = require("./_supabase");

// GET ?salon=slug&pin=1234 -> today's summary for the salon owner.
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
    .select("id, name, admin_pin")
    .eq("slug", salonSlug)
    .single();

  if (salonErr || !salon) {
    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: "Salon not found" }) };
  }
  if (pin !== salon.admin_pin) {
    return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: "Incorrect PIN" }) };
  }

  const day = todayDate();

  const { data: tokens, error: tokensErr } = await supabase
    .from("tokens")
    .select("status, service_id, created_at, services(name, price)")
    .eq("salon_id", salon.id)
    .eq("day", day);

  if (tokensErr) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: tokensErr.message }) };
  }

  const rows = tokens || [];
  const served = rows.filter((t) => t.status === "done");
  const noShows = rows.filter((t) => t.status === "no_show");

  // Popular service (by count of all bookings today, not just completed).
  const serviceCounts = {};
  rows.forEach((t) => {
    const name = t.services ? t.services.name : "Unknown";
    serviceCounts[name] = (serviceCounts[name] || 0) + 1;
  });
  const popularService = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1])[0];

  // Busiest hour, by booking creation time.
  const hourCounts = {};
  rows.forEach((t) => {
    const hour = new Date(t.created_at).getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });
  const busiestHourEntry = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
  const busiestHour = busiestHourEntry ? `${busiestHourEntry[0]}:00 - ${Number(busiestHourEntry[0]) + 1}:00` : null;

  const revenue = served.reduce((sum, t) => sum + (t.services && t.services.price ? Number(t.services.price) : 0), 0);

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      salon: salon.name,
      day,
      total_bookings: rows.length,
      served: served.length,
      no_shows: noShows.length,
      popular_service: popularService ? { name: popularService[0], count: popularService[1] } : null,
      busiest_hour: busiestHour,
      estimated_revenue: revenue,
    }),
  };
};
