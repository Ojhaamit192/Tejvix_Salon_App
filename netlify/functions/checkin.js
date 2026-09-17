const { CORS_HEADERS } = require("./_shared");
const { getSupabase, todayDate } = require("./_supabase");

// Staff calls this when a customer with a pre-booked appointment arrives.
// It converts their "scheduled" row into a normal "waiting" queue token
// with a real seq number, so they show up on the live board.
// Body: { salon: "tejvix", pin: "1234", token_id: "..." }
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
  const tokenId = (data.token_id || "").trim();

  if (!salonSlug || !pin || !tokenId) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "salon, pin and token_id are required" }) };
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

  const { data: appt, error: apptErr } = await supabase
    .from("tokens")
    .select("id, staff_id, day")
    .eq("id", tokenId)
    .eq("salon_id", salon.id)
    .eq("status", "scheduled")
    .single();
  if (apptErr || !appt) {
    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: "Appointment not found" }) };
  }

  const day = todayDate();

  const { data: maxRow } = await supabase
    .from("tokens")
    .select("seq")
    .eq("salon_id", salon.id)
    .eq("staff_id", appt.staff_id)
    .eq("day", day)
    .order("seq", { ascending: false })
    .limit(1);
  const seq = maxRow && maxRow.length ? maxRow[0].seq + 1 : 1;

  await supabase.from("tokens").update({ status: "waiting", seq, day }).eq("id", appt.id);

  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ token: `T${seq}` }) };
};
