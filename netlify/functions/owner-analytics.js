const { CORS_HEADERS } = require("./_shared");
const { getSupabase } = require("./_supabase");

// GET ?password=xxxx -> platform-wide totals across every salon, for the
// product owner (you) — not any individual salon's admin panel.
// Protected by OWNER_PASSWORD (a separate secret from any salon's PIN).
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  const ownerPassword = process.env.OWNER_PASSWORD;
  if (!ownerPassword) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "OWNER_PASSWORD is not set yet" }) };
  }

  const providedPassword = (event.queryStringParameters && event.queryStringParameters.password) || "";
  if (providedPassword !== ownerPassword) {
    return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: "Incorrect password" }) };
  }

  const supabase = getSupabase();

  const sevenDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [{ data: allTokens, error: tokensErr }, { data: salons, error: salonsErr }, { data: smsLogs, error: smsErr }] =
    await Promise.all([
      supabase.from("tokens").select("id, salon_id, status, day, phone, created_at, salons(name), services(name, price)"),
      supabase.from("salons").select("id, name"),
      supabase.from("sms_logs").select("id, status"),
    ]);

  if (tokensErr) return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: tokensErr.message }) };
  if (salonsErr) return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: salonsErr.message }) };

  const rows = allTokens || [];
  const served = rows.filter((t) => t.status === "done");
  const revenueOf = (t) => (t.services && t.services.price ? Number(t.services.price) : 0);

  const totalRevenue = served.reduce((sum, t) => sum + revenueOf(t), 0);
  const uniqueCustomers = new Set(served.map((t) => t.phone)).size;

  // SMS counts (sms_logs may not exist yet if migration_6 hasn't run — handle gracefully).
  const smsRows = smsErr ? [] : (smsLogs || []);
  const smsSent = smsRows.filter((s) => s.status === "sent").length;
  const smsDevMode = smsRows.filter((s) => s.status === "dev_mode").length;
  const smsFailed = smsRows.filter((s) => s.status === "failed").length;

  // Per-salon breakdown.
  const bySalon = {};
  (salons || []).forEach((s) => { bySalon[s.id] = { salon_name: s.name, bookings: 0, served: 0, revenue: 0 }; });
  rows.forEach((t) => {
    if (!bySalon[t.salon_id]) return;
    bySalon[t.salon_id].bookings += 1;
    if (t.status === "done") {
      bySalon[t.salon_id].served += 1;
      bySalon[t.salon_id].revenue += revenueOf(t);
    }
  });
  const perSalon = Object.values(bySalon).sort((a, b) => b.revenue - a.revenue);

  // Service breakdown across the whole platform.
  const serviceCounts = {};
  rows.forEach((t) => {
    const name = t.services ? t.services.name : "Unknown";
    serviceCounts[name] = (serviceCounts[name] || 0) + 1;
  });
  const serviceBreakdown = Object.entries(serviceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  // 7-day platform-wide trend.
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

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      total_salons: (salons || []).length,
      total_bookings: rows.length,
      total_served: served.length,
      total_no_shows: rows.filter((t) => t.status === "no_show").length,
      total_revenue: totalRevenue,
      unique_customers: uniqueCustomers,
      avg_revenue_per_customer: uniqueCustomers ? Math.round((totalRevenue / uniqueCustomers) * 100) / 100 : 0,
      sms_sent: smsSent,
      sms_dev_mode: smsDevMode,
      sms_failed: smsFailed,
      per_salon: perSalon,
      service_breakdown: serviceBreakdown,
      trend,
    }),
  };
};
