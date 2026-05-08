import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/utils";

export const dynamic = "force-dynamic";

function downloadResponse(body: string, filename: string, contentType: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string; type: string }> }) {
  const { id, type } = await context.params;
  const giveaway = await prisma.giveaway.findUnique({
    where: { id },
    include: {
      rules: true,
      drawResults: {
        orderBy: [{ type: "desc" }, { position: "asc" }],
        include: { comment: true },
      },
      captureJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      auditLogs: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!giveaway) {
    return NextResponse.json({ error: "Resultado não encontrado." }, { status: 404 });
  }

  if (type === "resultado-json") {
    return downloadResponse(JSON.stringify(giveaway, null, 2), `resultado-${id}.json`, "application/json");
  }

  if (type === "participantes-validos-csv") {
    const comments = await prisma.comment.findMany({
      where: { giveawayId: id, isValid: true },
      orderBy: [{ username: "asc" }, { createdAt: "asc" }],
    });

    return downloadResponse(
      toCsv(
        comments.map((comment) => ({
          username: comment.username,
          text: comment.text,
          commentedAt: comment.commentedAt?.toISOString() ?? "",
          commentId: comment.id,
        })),
      ),
      `participantes-validos-${id}.csv`,
      "text/csv; charset=utf-8",
    );
  }

  if (type === "comentarios-invalidos-csv") {
    const comments = await prisma.comment.findMany({
      where: { giveawayId: id, invalidReason: { not: null } },
      orderBy: [{ username: "asc" }, { createdAt: "asc" }],
    });

    return downloadResponse(
      toCsv(
        comments.map((comment) => ({
          username: comment.username,
          text: comment.text,
          invalidReason: comment.invalidReason ?? "",
          commentedAt: comment.commentedAt?.toISOString() ?? "",
          commentId: comment.id,
        })),
      ),
      `comentarios-invalidos-${id}.csv`,
      "text/csv; charset=utf-8",
    );
  }

  if (type === "relatorio-tecnico-json") {
    return downloadResponse(
      JSON.stringify(
        {
          giveawayId: giveaway.id,
          status: giveaway.status,
          captureJobs: giveaway.captureJobs,
          auditLogs: giveaway.auditLogs,
        },
        null,
        2,
      ),
      `relatorio-tecnico-${id}.json`,
      "application/json",
    );
  }

  return NextResponse.json({ error: "Exportação não suportada." }, { status: 404 });
}
