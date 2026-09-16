const { CORS_HEADERS } = require("./_shared");
const { getSupabase, todayDate } = require("./_supabase");
const { sendSms } = require("./_sms");

// Called by the barber's admin page when they tap "Next Customer".
// Body: { salon: "tejvix", pin: "1234" }
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

  // Mark whoever is currently "serving" as done.
  await supabase
    .from("tokens")
    .update({ status: "done" })
    .eq("salon_id", salon.id)
    .eq("day", day)
    .eq("status", "serving");

  const { data: waiting, error: waitingErr } = await supabase
    .from("tokens")
    .select("id, seq, phone")
    .eq("salon_id", salon.id)
    .eq("day", day)
    .eq("status", "waiting")
    .order("seq")
    .limit(2);

  if (waitingErr) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: waitingErr.message }) };
  }

  const next = waiting && waiting[0];
  const upcoming = waiting && waiting[1];

  if (!next) {
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ message: "Queue is empty" }) };
  }

  await supabase.from("tokens").update({ status: "serving" }).eq("id", next.id);

  await sendSms(next.phone, `${salon.name}: It's your turn! Token T${next.seq} — please come to the counter.`);

  if (upcoming) {
    await sendSms(upcoming.phone, `${salon.name}: You're next (Token T${upcoming.seq}). Please be ready.`);
  }

  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ now_serving: `T${next.seq}` }) };
};
