const { CORS_HEADERS } = require("./_shared");
const { getSupabase } = require("./_supabase");

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
    .select("id")
    .eq("slug", salonSlug)
    .single();

  if (salonErr || !salon) {
    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: "Salon not found" }) };
  }

  const { data, error } = await supabase
    .from("services")
    .select("id, name, price, duration_minutes")
    .eq("salon_id", salon.id)
    .order("name");

  if (error) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: error.message }) };
  }

  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ services: data }) };
};
