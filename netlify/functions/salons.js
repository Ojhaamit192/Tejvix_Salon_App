const { CORS_HEADERS } = require("./_shared");
const { getSupabase } = require("./_supabase");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("salons")
    .select("slug, name, address, phone")
    .order("name");

  if (error) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: error.message }) };
  }

  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ salons: data }) };
};
