const { CORS_HEADERS } = require("./_shared");
const { getSupabase, todayDate } = require("./_supabase");
const { sendSms } = require("./_sms");

// Called by the barber's admin page.
// Body: { salon: "tejvix", staff_id: "...", pin: "1234", outcome: "done" | "no_show" }
// "outcome" describes what happened to whoever was currently being served
// (defaults to "done" for backward compatibility).
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
  const staffId = (data.staff_id || "").trim();
  const pin = (data.pin || "").trim();
  const outcome = data.outcome === "no_show" ? "no_show" : "done";
  const reason = (data.reason || "").trim();

  if (!salonSlug || !staffId || !pin) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "salon, staff_id and pin are required" }) };
  }
  if (outcome === "no_show" && !reason) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "A reason is required to mark a no-show/cancellation" }) };
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

  // Resolve whoever is currently "serving" for this staff member.
  const { data: currentServing } = await supabase
    .from("tokens")
    .select("id")
    .eq("salon_id", salon.id)
    .eq("staff_id", staffId)
    .eq("day", day)
    .eq("status", "serving")
    .maybeSingle();

  if (currentServing) {
    await supabase.from("tokens").update({ status: outcome, cancellation_reason: outcome === "no_show" ? reason : null }).eq("id", currentServing.id);

    // Ask for a review only when the visit actually happened.
    if (outcome === "done") {
      const { data: justServed } = await supabase
        .from("tokens")
        .select("phone")
        .eq("id", currentServing.id)
        .single();
      if (justServed) {
        await sendSms(justServed.phone, `${salon.name}: Thanks for visiting! Rate your experience: reply with a number 1-5.`, salon.id);
      }
    }
  }

  const { data: waiting, error: waitingErr } = await supabase
    .from("tokens")
    .select("id, seq, phone")
    .eq("salon_id", salon.id)
    .eq("staff_id", staffId)
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

  await supabase.from("tokens").update({ status: "serving", called_at: new Date().toISOString() }).eq("id", next.id);

  await sendSms(next.phone, `${salon.name}: It's your turn! Token T${next.seq} — please come to the counter.`, salon.id);
  if (upcoming) {
    await sendSms(upcoming.phone, `${salon.name}: You're next (Token T${upcoming.seq}). Please be ready.`, salon.id);
  }

  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ now_serving: `T${next.seq}` }) };
};
