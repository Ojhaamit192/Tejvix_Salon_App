const { CORS_HEADERS } = require("./_shared");
const { getSupabase, todayDate } = require("./_supabase");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  const salonSlug = (event.queryStringParameters && event.queryStringParameters.salon) || "";
  if (!salonSlug) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "salon query param is required" }) };
  }

  const supabase = getSupabase();

  const { data: salon, error: salonErr } = await supabase
    .from("salons")
    .select("id, name, address, phone")
    .eq("slug", salonSlug)
    .single();

  if (salonErr || !salon) {
    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: "Salon not found" }) };
  }

  const day = todayDate();

  const { data: tokens, error: tokensErr } = await supabase
    .from("tokens")
    .select("seq, name, service, status")
    .eq("salon_id", salon.id)
    .eq("day", day)
    .order("seq");

  if (tokensErr) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: tokensErr.message }) };
  }

  const serving = (tokens || []).find((t) => t.status === "serving");
  const waiting = (tokens || []).filter((t) => t.status === "waiting");

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      salon: { name: salon.name, address: salon.address, phone: salon.phone },
      now_serving: serving ? { token: `T${serving.seq}`, name: serving.name } : null,
      waiting: waiting.map((t) => ({ token: `T${t.seq}`, name: t.name, service: t.service })),
    }),
  };
};
