const { CORS_HEADERS } = require("./_shared");
const { getSupabase, todayDate } = require("./_supabase");
const { sendSms } = require("./_sms");

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
  const service = (data.service || "").trim();

  if (!salonSlug || !name || !phone || !service) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "salon, name, phone and service are required" }),
    };
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

  const day = todayDate();

  const { data: maxRow } = await supabase
    .from("tokens")
    .select("seq")
    .eq("salon_id", salon.id)
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
    service,
    status: "waiting",
  });

  if (insertErr) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: insertErr.message }) };
  }

  const { count: ahead } = await supabase
    .from("tokens")
    .select("*", { count: "exact", head: true })
    .eq("salon_id", salon.id)
    .eq("day", day)
    .eq("status", "waiting")
    .lt("seq", seq);

  await sendSms(
    phone,
    `${salon.name}: Your token T${seq} is confirmed. ${ahead || 0} people are ahead of you. We'll text you when your turn is close.`
  );

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({ token: `T${seq}`, ahead: ahead || 0, service }),
  };
};
