const { getSupabase } = require("./_supabase");
const { sendSms } = require("./_sms");

// Runs automatically every 5 minutes (see netlify.toml's schedule config).
// Finds appointments happening in roughly 25-35 minutes that haven't had a
// reminder sent yet, texts the customer, and marks them so they don't get
// reminded twice. This is not an HTTP endpoint — Netlify invokes it on a
// timer, not through /api/*.
exports.handler = async () => {
  const supabase = getSupabase();

  const now = Date.now();
  const windowStart = new Date(now + 25 * 60 * 1000).toISOString();
  const windowEnd = new Date(now + 35 * 60 * 1000).toISOString();

  const { data: due, error } = await supabase
    .from("tokens")
    .select("id, phone, scheduled_at, salons(name), services(name)")
    .eq("booking_type", "appointment")
    .eq("status", "scheduled")
    .eq("reminder_sent", false)
    .gte("scheduled_at", windowStart)
    .lte("scheduled_at", windowEnd);

  if (error) {
    console.error("send-reminders query failed:", error.message);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  for (const appt of due || []) {
    const salonName = appt.salons ? appt.salons.name : "Your salon";
    const serviceName = appt.services ? appt.services.name : "your appointment";
    const when = new Date(appt.scheduled_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });

    await sendSms(appt.phone, `Reminder: your ${serviceName} appointment at ${salonName} is at ${when} — see you soon!`);
    await supabase.from("tokens").update({ reminder_sent: true }).eq("id", appt.id);
  }

  return { statusCode: 200, body: JSON.stringify({ reminders_sent: (due || []).length }) };
};
