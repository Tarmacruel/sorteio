import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { getInstagramAuthStateStatus } from "@/lib/instagram-auth";

export const dynamic = "force-dynamic";

function getNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
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
      message: "Sessao autenticada do Instagram ja existe.",
    });
  }

  const child = spawn(getNpmCommand(), ["run", "instagram:auth"], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });

  child.unref();

  return NextResponse.json(
    {
      auth,
      message: "Janela de login do Instagram aberta. Conclua o login manualmente para salvar a sessao.",
    },
    { status: 202 },
  );
}
