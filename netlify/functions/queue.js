const { CORS_HEADERS } = require("./_shared");
const { getSupabase, todayDate } = require("./_supabase");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  const params = event.queryStringParameters || {};
  const salonSlug = params.salon || "";
  if (!salonSlug) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "salon query param is required" }) };
  }

  const supabase = getSupabase();

  const { data: salon, error: salonErr } = await supabase
    .from("salons")
    .select("id, name, address, phone, brand_color, photos, upi_id, payment_qr_url, happy_hours_enabled, happy_hours_discount_percent, sms_mode")
    .eq("slug", salonSlug)
    .single();
  if (salonErr || !salon) {
    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: "Salon not found" }) };
  }

  const { data: staffList, error: staffErr } = await supabase
    .from("staff")
    .select("id, name")
    .eq("salon_id", salon.id)
    .eq("is_active", true)
    .order("name");
  if (staffErr) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: staffErr.message }) };
  }

  const day = todayDate();

  const { data: tokens, error: tokensErr } = await supabase
    .from("tokens")
    .select("seq, name, status, staff_id, services(name, duration_minutes)")
    .eq("salon_id", salon.id)
    .eq("day", day)
    .in("status", ["waiting", "serving"]);
  if (tokensErr) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: tokensErr.message }) };
  }

  const rows = tokens || [];

  const queues = (staffList || []).map((member) => {
    const mine = rows.filter((t) => t.staff_id === member.id).sort((a, b) => a.seq - b.seq);
    const serving = mine.find((t) => t.status === "serving");
    const waiting = mine.filter((t) => t.status === "waiting");

    let runningMinutes = 0;
    const waitingWithEta = waiting.map((t) => {
      const duration = t.services ? t.services.duration_minutes : 20;
      const eta = runningMinutes;
      runningMinutes += duration;
      return {
        token: `T${t.seq}`,
        name: t.name,
        service: t.services ? t.services.name : "",
        estimated_wait_minutes: eta,
      };
    });

    return {
      staff_id: member.id,
      staff_name: member.name,
      now_serving: serving ? { token: `T${serving.seq}`, name: serving.name } : null,
      waiting: waitingWithEta,
    };
  });

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      salon: {
        name: salon.name,
        address: salon.address,
        phone: salon.phone,
        brand_color: salon.brand_color || null,
        photos: salon.photos || [],
        upi_id: salon.upi_id || null,
        payment_qr_url: salon.payment_qr_url || null,
        happy_hours_enabled: !!salon.happy_hours_enabled,
        happy_hours_discount_percent: salon.happy_hours_discount_percent,
        sms_mode: salon.sms_mode || "real",
      },
      queues,
    }),
  };
};
