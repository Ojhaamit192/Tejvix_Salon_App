const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

function todayKey() {
  return `queue-${new Date().toISOString().slice(0, 10)}`;
}

module.exports = { CORS_HEADERS, todayKey };
