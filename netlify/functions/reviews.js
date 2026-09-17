const { CORS_HEADERS } = require("./_shared");
const { getSupabase } = require("./_supabase");

// GET ?salon=slug -> average rating + count, for showing in the directory.
// POST { token_id, rating, comment } -> submit a review after a visit.
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  const supabase = getSupabase();

  if (event.httpMethod === "GET") {
    const salonSlug = (event.queryStringParameters && event.queryStringParameters.salon) || "";
    if (!salonSlug) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "salon query param is required" }) };
    }

    const { data: salon, error: salonErr } = await supabase
      .from("salons")
      .select("id")
      .eq("slug", salonSlug)
      .single();

    if (salonErr || !salon) {
      return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: "Salon not found" }) };
    }

    const { data, error } = await supabase
      .from("reviews")
      .select("rating")
      .eq("salon_id", salon.id);

    if (error) {
      return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: error.message }) };
    }

    const count = data.length;
    const average = count ? data.reduce((sum, r) => sum + r.rating, 0) / count : null;

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ average: average ? Math.round(average * 10) / 10 : null, count }),
    };
  }

  if (event.httpMethod === "POST") {
    let data;
    try {
      data = JSON.parse(event.body || "{}");
    } catch {
      data = {};
    }

    const tokenId = (data.token_id || "").trim();
    const rating = Number(data.rating);
    const comment = (data.comment || "").trim();

    if (!tokenId || !rating || rating < 1 || rating > 5) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "token_id and a rating (1-5) are required" }) };
    }

    const { data: token, error: tokenErr } = await supabase
      .from("tokens")
      .select("id, salon_id")
      .eq("id", tokenId)
      .single();

    if (tokenErr || !token) {
      return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: "Token not found" }) };
    }

    const { error: insertErr } = await supabase.from("reviews").insert({
      salon_id: token.salon_id,
      token_id: token.id,
      rating,
      comment,
    });

    if (insertErr) {
      return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: insertErr.message }) };
    }

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
};
