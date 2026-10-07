import { spawn, exec } from "child_process";
import { createRequire } from "module";

const port = process.env.PORT ?? "3000";
const url = `http://127.0.0.1:${port}`;
const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const child = spawn(process.execPath, [nextBin, "dev", "--turbopack", "-p", port], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 0));

async function waitReady() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return true;
    } catch {
      /* still booting */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

if (await waitReady()) {
  exec(`cmd /c start "" "${url}"`);
  console.log(`\nPriceArtAlert открыт: ${url}`);
  console.log("Не закрывай это окно — пока оно открыто, алерты проверяются.\n");
} else {
  console.error("Сервер не поднялся. Проверь, установлен ли Node.js.");
}
