import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

function resolveAuthStatePath() {
  const configuredPath = process.env.INSTAGRAM_AUTH_STATE_PATH ?? "storage/instagram-auth.json";
  return path.isAbsolute(configuredPath) ? configuredPath : path.resolve(process.cwd(), configuredPath);
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

  console.log("Faca login manualmente na janela aberta.");
  console.log("Apos concluir o login e visualizar a pagina inicial do Instagram, aguarde...");

  await page.waitForURL(/instagram\.com\/(?!accounts\/login)/, {
    timeout: 180_000,
  });

  await context.storageState({ path: storagePath });

  console.log(`Sessao salva em: ${storagePath}`);

  await browser.close();
}

main().catch((error) => {
  console.error("Erro ao salvar sessao do Instagram:", error);
  process.exit(1);
});
