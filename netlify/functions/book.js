const { CORS_HEADERS } = require("./_shared");
const { getSupabase, todayDate } = require("./_supabase");
const { sendSms } = require("./_sms");

const LOYALTY_EVERY = 5; // every 5th completed visit gets a reward message

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
  const name = (data.name || "").trim();
  const phone = (data.phone || "").trim();
  const serviceId = (data.service_id || "").trim();
  let staffId = (data.staff_id || "").trim();
  const bookingType = data.booking_type === "appointment" ? "appointment" : "walkin";
  const scheduledAt = (data.scheduled_at || "").trim(); // ISO string, required for appointments

  if (!salonSlug || !name || !phone || !serviceId) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "salon, name, phone and service_id are required" }),
    };
  }
  if (bookingType === "appointment" && !scheduledAt) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "scheduled_at is required for appointments" }) };
  }

  const supabase = getSupabase();

  const { data: salon, error: salonErr } = await supabase
    .from("salons")
    .select("id, name")
    .eq("slug", salonSlug)
    .single();
  if (salonErr || !salon) {
    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: "Salon not found" }) };
  }

  const { data: service, error: serviceErr } = await supabase
    .from("services")
    .select("id, name, duration_minutes")
    .eq("id", serviceId)
    .eq("salon_id", salon.id)
    .single();
  if (serviceErr || !service) {
    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: "Service not found" }) };
  }

  // If no staff chosen, auto-assign the first active staff member.
  if (!staffId) {
    const { data: firstStaff } = await supabase
      .from("staff")
      .select("id")
      .eq("salon_id", salon.id)
      .eq("is_active", true)
      .order("name")
      .limit(1)
      .single();
    if (firstStaff) staffId = firstStaff.id;
  }

  const day = todayDate();

  // ---------- Appointment booking (scheduled for later, not in live queue yet) ----------
  if (bookingType === "appointment") {
    const { data: inserted, error: insertErr } = await supabase
      .from("tokens")
      .insert({
        salon_id: salon.id,
        day,
        seq: 0, // assigned properly at check-in time
        name,
        phone,
        service_id: service.id,
        staff_id: staffId || null,
        status: "scheduled",
        booking_type: "appointment",
        scheduled_at: scheduledAt,
      })
      .select("id")
      .single();

    if (insertErr) {
      return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: insertErr.message }) };
    }

    const when = new Date(scheduledAt).toLocaleString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
    await sendSms(phone, `${salon.name}: Your appointment for ${service.name} at ${when} is booked. See you then!`);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ booking_type: "appointment", scheduled_at: scheduledAt, service: service.name }),
    };
  }

  // ---------- Walk-in booking (joins the live queue now) ----------
  const { data: maxRow } = await supabase
    .from("tokens")
    .select("seq")
    .eq("salon_id", salon.id)
    .eq("staff_id", staffId)
    .eq("day", day)
    .order("seq", { ascending: false })
    .limit(1);

  const seq = maxRow && maxRow.length ? maxRow[0].seq + 1 : 1;

  const { error: insertErr } = await supabase.from("tokens").insert({
    salon_id: salon.id,
    day,
    seq,
    name,
    phone,
    service_id: service.id,
    staff_id: staffId || null,
    status: "waiting",
    booking_type: "walkin",
  });
  if (insertErr) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: insertErr.message }) };
  }

  const { count: ahead } = await supabase
    .from("tokens")
    .select("*", { count: "exact", head: true })
    .eq("salon_id", salon.id)
    .eq("staff_id", staffId)
    .eq("day", day)
    .eq("status", "waiting")
    .lt("seq", seq);

  const aheadCount = ahead || 0;
  const estimatedWaitMinutes = aheadCount * service.duration_minutes;

  // Loyalty: count this phone's completed visits at this salon (all time).
  const { count: pastVisits } = await supabase
    .from("tokens")
    .select("*", { count: "exact", head: true })
    .eq("salon_id", salon.id)
    .eq("phone", phone)
    .eq("status", "done");

  const visitNumber = (pastVisits || 0) + 1;
  let loyaltyMessage = null;
  if (visitNumber % LOYALTY_EVERY === 0) {
    loyaltyMessage = `This is your visit #${visitNumber} — ask staff about your loyalty reward!`;
  } else {
    const toGo = LOYALTY_EVERY - (visitNumber % LOYALTY_EVERY);
    loyaltyMessage = `Visit #${visitNumber}. ${toGo} more visit${toGo > 1 ? "s" : ""} until your loyalty reward.`;
  }

  await sendSms(
    phone,
    `${salon.name}: Your token T${seq} is confirmed. ${aheadCount} ahead of you, ~${estimatedWaitMinutes} min wait. ${loyaltyMessage}`
  );

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      booking_type: "walkin",
      token: `T${seq}`,
      ahead: aheadCount,
      estimated_wait_minutes: estimatedWaitMinutes,
      service: service.name,
      loyalty_message: loyaltyMessage,
    }),
  };
};
