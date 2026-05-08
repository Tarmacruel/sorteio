import "dotenv/config";
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

function resolveAuthPath() {
  return path.resolve(process.cwd(), process.env.INSTAGRAM_AUTH_STATE_PATH ?? "storage/instagram-auth.json");
}

async function main() {
  const authPath = resolveAuthPath();
  const authDir = path.dirname(authPath);

  fs.mkdirSync(authDir, { recursive: true });

  const browser = await chromium.launch({
    headless: false,
    slowMo: 60,
  });

  const context = await browser.newContext({
    locale: "pt-BR",
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();

  console.log("Abrindo tela de login do Instagram...");
  await page.goto("https://www.instagram.com/accounts/login/", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });

  console.log("Faça login manualmente na janela aberta.");
  console.log("Se houver autenticação em duas etapas, conclua normalmente.");
  console.log("A sessão será salva quando a navegação sair da tela de login.");

  await page.waitForFunction(
    () => {
      const href = window.location.href;
      return href.includes("instagram.com") && !href.includes("/accounts/login");
    },
    undefined,
    { timeout: 240_000 },
  );

  await page.waitForTimeout(3000);
  await context.storageState({ path: authPath });

  console.log(`Sessão autenticada salva em: ${authPath}`);
  console.log("Mantenha este arquivo fora do GitHub. Ele contém cookies/sessão autenticada.");

  await browser.close();
}

main().catch((error) => {
  console.error("Erro ao gerar sessão autenticada do Instagram:", error);
  process.exit(1);
});
