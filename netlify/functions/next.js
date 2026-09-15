const { getStore } = require("@netlify/blobs");
const { CORS_HEADERS, todayKey } = require("./_shared");
const { sendSms } = require("./_twilio");

// This endpoint is for salon staff to call the next customer.
// It's plain API for now — wire it up to an admin button/page, or call
// it directly (e.g. with a tool like Postman or curl) at the counter.
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const store = getStore("tejvix-queue");
  const key = todayKey();
  const current = (await store.get(key, { type: "json" })) || { tokens: [] };

  // Mark whoever was being served as done.
  current.tokens = current.tokens.map((t) => (t.status === "serving" ? { ...t, status: "done" } : t));

  const waiting = current.tokens.filter((t) => t.status === "waiting").sort((a, b) => a.seq - b.seq);
  const next = waiting[0];

  if (!next) {
    await store.setJSON(key, current);
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ message: "Queue is empty" }) };
  }

  current.tokens = current.tokens.map((t) => (t.seq === next.seq ? { ...t, status: "serving" } : t));
  await store.setJSON(key, current);

  await sendSms(next.phone, `Tejvix Salon: It's your turn! Token T${next.seq} — please come to the counter.`);

  const upcoming = waiting[1];
  if (upcoming) {
    await sendSms(upcoming.phone, `Tejvix Salon: You're next (Token T${upcoming.seq}). Please be ready.`);
  }

  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ now_serving: `T${next.seq}` }) };
};
