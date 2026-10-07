const base = process.env.APP_URL ?? "http://localhost:3000";

async function tick() {
  try {
    const res = await fetch(`${base}/api/check`, { method: "POST" });
    if (!res.ok) console.error("check", res.status);
  } catch (err) {
    console.error(err.message);
  }
}

setInterval(tick, 12000);
void tick();
console.log("PriceArtAlert watcher ->", base);
