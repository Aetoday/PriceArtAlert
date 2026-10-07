export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAlertLoop } = await import("./lib/engine");
    startAlertLoop();
  }
}
