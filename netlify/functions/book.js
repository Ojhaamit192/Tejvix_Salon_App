const { getStore } = require("@netlify/blobs");
const { CORS_HEADERS, todayKey } = require("./_shared");
const { sendSms } = require("./_twilio");

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

  const name = (data.name || "").trim();
  const phone = (data.phone || "").trim();
  const service = (data.service || "").trim();

  if (!name || !phone || !service) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Name, phone and service are required" }),
    };
  }

  const store = getStore("tejvix-queue");
  const key = todayKey();
  const current = (await store.get(key, { type: "json" })) || { tokens: [] };

  const seq = current.tokens.length ? Math.max(...current.tokens.map((t) => t.seq)) + 1 : 1;
  current.tokens.push({ seq, name, phone, service, status: "waiting" });
  await store.setJSON(key, current);

  const ahead = current.tokens.filter((t) => t.status === "waiting" && t.seq < seq).length;

  await sendSms(
    phone,
    `Tejvix Salon: Your token T${seq} is confirmed. ${ahead} people are ahead of you. We'll text you when your turn is close.`
  );

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({ token: `T${seq}`, ahead, service }),
  };
};
