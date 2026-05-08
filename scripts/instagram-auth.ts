import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { getInstagramAuthStatePath } from "@/lib/instagram-auth";

function resolveAuthStatePath() {
  return getInstagramAuthStatePath();
}

async function main() {
  const storagePath = resolveAuthStatePath();
  const storageDir = path.dirname(storagePath);

  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "pt-BR",
  });

  const page = await context.newPage();

  console.log("Abrindo Instagram...");
  await page.goto("https://www.instagram.com/accounts/login/", {
    waitUntil: "domcontentloaded",
  });

  console.log("Faça login manualmente na janela aberta.");
  console.log("Após concluir o login e visualizar a página inicial do Instagram, aguarde...");

  await page.waitForURL(/instagram\.com\/(?!accounts\/login)/, {
    timeout: 180_000,
  });

  await context.storageState({ path: storagePath });

  console.log(`Sessão salva em: ${storagePath}`);

  await browser.close();
}

main().catch((error) => {
  console.error("Erro ao salvar sessão do Instagram:", error);
  process.exit(1);
});
