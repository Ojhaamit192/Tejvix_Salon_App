const { getStore } = require("@netlify/blobs");
const { CORS_HEADERS, todayKey } = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  const store = getStore("tejvix-queue");
  const key = todayKey();
  const current = (await store.get(key, { type: "json" })) || { tokens: [] };

  const serving = current.tokens.find((t) => t.status === "serving");
  const waiting = current.tokens
    .filter((t) => t.status === "waiting")
    .sort((a, b) => a.seq - b.seq);

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      now_serving: serving ? { token: `T${serving.seq}`, name: serving.name } : null,
      waiting: waiting.map((t) => ({ token: `T${t.seq}`, name: t.name, service: t.service })),
    }),
  };
};
