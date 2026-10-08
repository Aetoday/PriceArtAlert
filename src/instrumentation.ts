export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAlertLoop } = await import("./lib/engine");
    const { startDelistLoop } = await import("./lib/announcements");
    startAlertLoop();
    startDelistLoop();
  }
}
