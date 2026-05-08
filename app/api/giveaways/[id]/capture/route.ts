import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enqueueInstagramCapture, removeInstagramCaptureJob } from "@/lib/queue";
import { registerAuditLog } from "@/services/audit.service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const job = await prisma.instagramCaptureJob.findFirst({
    where: { giveawayId: id },
    orderBy: { createdAt: "desc" },
  });

  const giveaway = await prisma.giveaway.findUnique({
    where: { id },
    select: {
      status: true,
      capturedAt: true,
      instagramPostUrl: true,
    },
  });

  const [captured, valid, invalid] = await Promise.all([
    prisma.comment.count({ where: { giveawayId: id } }),
    prisma.comment.count({ where: { giveawayId: id, isValid: true } }),
    prisma.comment.count({ where: { giveawayId: id, invalidReason: { not: null } } }),
  ]);

  return NextResponse.json({
    job,
    giveaway,
    stats: {
      captured,
      valid,
      invalid,
    },
  });
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const giveaway = await prisma.giveaway.findUnique({ where: { id } });
  if (!giveaway) {
    return NextResponse.json({ error: "Sorteio nao encontrado." }, { status: 404 });
  }

  if (["capturing", "drawn"].includes(giveaway.status)) {
    return NextResponse.json({ error: "Este sorteio nao pode iniciar uma nova captura agora." }, { status: 409 });
  }

  const captureJob = await prisma.instagramCaptureJob.create({
    data: {
      giveawayId: id,
      status: "queued",
      currentStep: "Aguardando worker de captura...",
      logs: [
        {
          at: new Date().toISOString(),
          message: "Captura automatica enfileirada.",
        },
      ],
    },
  });

  try {
    await enqueueInstagramCapture({
      giveawayId: id,
      postUrl: giveaway.instagramPostUrl,
      captureJobId: captureJob.id,
    });

    await prisma.giveaway.update({
      where: { id },
      data: { status: "capturing" },
    });

    await registerAuditLog({
      giveawayId: id,
      action: "capture_enqueued",
      payload: {
        captureJobId: captureJob.id,
      },
    });

    return NextResponse.json({ captureJob }, { status: 202 });
  } catch (error) {
    const friendlyMessage =
      "Nao foi possivel conectar ao Redis local para enfileirar a captura. Inicie o Redis em localhost:6379 e execute o worker de captura.";

    await prisma.instagramCaptureJob.update({
      where: { id: captureJob.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        currentStep: friendlyMessage,
        errorMessage: friendlyMessage,
        logs: [
          {
            at: new Date().toISOString(),
            message: "Falha ao enfileirar captura automatica.",
            details: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
        ],
      },
    });

    await prisma.giveaway.update({
      where: { id },
      data: { status: "capture_failed" },
    });

    return NextResponse.json(
      { error: friendlyMessage },
      { status: 503 },
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const captureJob = await prisma.instagramCaptureJob.findFirst({
    where: {
      giveawayId: id,
      status: { in: ["queued", "running"] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!captureJob) {
    return NextResponse.json({ error: "Nao ha captura ativa para cancelar." }, { status: 404 });
  }

  await removeInstagramCaptureJob(captureJob.id).catch(() => undefined);

  await prisma.instagramCaptureJob.update({
    where: { id: captureJob.id },
    data: {
      status: "cancelled",
      finishedAt: new Date(),
      currentStep: "Captura cancelada pelo usuario.",
    },
  });

  await prisma.giveaway.update({
    where: { id },
    data: { status: "ready_to_capture" },
  });

  await registerAuditLog({
    giveawayId: id,
    action: "capture_cancelled",
    payload: { captureJobId: captureJob.id },
  });

  return NextResponse.json({ ok: true });
}
