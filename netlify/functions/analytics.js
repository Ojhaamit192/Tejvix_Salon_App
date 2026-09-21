const { CORS_HEADERS } = require("./_shared");
const { getSupabase, todayDate } = require("./_supabase");

// GET ?salon=slug&pin=1234 -> today's summary + last-7-days trend data for
// the salon owner's dashboard charts.
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

  const today = todayDate();
  const sevenDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: tokens, error: tokensErr } = await supabase
    .from("tokens")
    .select("status, day, created_at, services(name, price)")
    .eq("salon_id", salon.id)
    .gte("day", sevenDaysAgo);

  if (tokensErr) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: tokensErr.message }) };
  }

  const rows = tokens || [];
  const todayRows = rows.filter((t) => t.day === today);
  const servedToday = todayRows.filter((t) => t.status === "done");
  const noShowsToday = todayRows.filter((t) => t.status === "no_show");

  const revenueOf = (t) => (t.services && t.services.price ? Number(t.services.price) : 0);

  // ---- Today's summary (unchanged shape from before) ----
  const serviceCountsToday = {};
  todayRows.forEach((t) => {
    const name = t.services ? t.services.name : "Unknown";
    serviceCountsToday[name] = (serviceCountsToday[name] || 0) + 1;
  });
  const popularServiceToday = Object.entries(serviceCountsToday).sort((a, b) => b[1] - a[1])[0];

  const hourCountsToday = {};
  todayRows.forEach((t) => {
    const hour = new Date(t.created_at).getHours();
    hourCountsToday[hour] = (hourCountsToday[hour] || 0) + 1;
  });
  const busiestHourEntry = Object.entries(hourCountsToday).sort((a, b) => b[1] - a[1])[0];
  const busiestHour = busiestHourEntry ? `${busiestHourEntry[0]}:00 - ${Number(busiestHourEntry[0]) + 1}:00` : null;

  const revenueToday = servedToday.reduce((sum, t) => sum + revenueOf(t), 0);

  // ---- 7-day trend (for charts) ----
  const dayBuckets = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    dayBuckets[d] = { bookings: 0, revenue: 0 };
  }
  rows.forEach((t) => {
    if (!dayBuckets[t.day]) return;
    dayBuckets[t.day].bookings += 1;
    if (t.status === "done") dayBuckets[t.day].revenue += revenueOf(t);
  });
  const trend = Object.keys(dayBuckets)
    .sort()
    .map((d) => ({ date: d, bookings: dayBuckets[d].bookings, revenue: dayBuckets[d].revenue }));

  // ---- Service breakdown over the week ----
  const serviceCountsWeek = {};
  rows.forEach((t) => {
    const name = t.services ? t.services.name : "Unknown";
    serviceCountsWeek[name] = (serviceCountsWeek[name] || 0) + 1;
  });
  const serviceBreakdown = Object.entries(serviceCountsWeek)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, count }));

  // ---- Hourly breakdown over the week ----
  const hourCountsWeek = {};
  rows.forEach((t) => {
    const hour = new Date(t.created_at).getHours();
    hourCountsWeek[hour] = (hourCountsWeek[hour] || 0) + 1;
  });
  const hourlyBreakdown = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: hourCountsWeek[h] || 0 }));

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      salon: salon.name,
      day: today,
      total_bookings: todayRows.length,
      served: servedToday.length,
      no_shows: noShowsToday.length,
      popular_service: popularServiceToday ? { name: popularServiceToday[0], count: popularServiceToday[1] } : null,
      busiest_hour: busiestHour,
      estimated_revenue: revenueToday,
      trend,
      service_breakdown: serviceBreakdown,
      hourly_breakdown: hourlyBreakdown,
    }),
  };
};
