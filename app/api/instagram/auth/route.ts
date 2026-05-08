import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { getInstagramAuthStateStatus } from "@/lib/instagram-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function escapePowerShellSingleQuoted(value: string) {
  return value.replace(/'/g, "''");
}

function startInstagramAuthProcess() {
  if (process.platform === "win32") {
    const command = [
      "$ErrorActionPreference = 'Stop'",
      `Start-Process -FilePath '${getNpmCommand()}' -ArgumentList @('run','instagram:auth') -WorkingDirectory '${escapePowerShellSingleQuoted(process.cwd())}' -WindowStyle Normal`,
    ].join("; ");

    return spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
      cwd: process.cwd(),
      stdio: "ignore",
      windowsHide: true,
    });
  }

  const child = spawn(getNpmCommand(), ["run", "instagram:auth"], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
  });

  child.unref();
  return child;
}

export async function GET() {
  return NextResponse.json({
    auth: getInstagramAuthStateStatus(),
  });
}

export async function POST() {
  const auth = getInstagramAuthStateStatus();

  if (auth.exists) {
    return NextResponse.json({
      auth,
      message: "Sessão autenticada do Instagram já existe.",
    });
  }

  try {
    startInstagramAuthProcess();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          "Não foi possível abrir a janela de login automaticamente. Execute `npm run instagram:auth` no terminal.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      auth,
      message: "Janela de login do Instagram aberta. Conclua o login manualmente para salvar a sessão.",
    },
    { status: 202 },
  );
}
