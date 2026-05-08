import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeUsername } from "@/lib/utils";
import { registerAuditLog } from "@/services/audit.service";

function hash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function buildParticipantsHash(
  participants: Array<{
    id: string;
    username: string;
    text: string;
    createdAt: Date;
  }>,
) {
  const canonical = participants
    .map((participant) => ({
      id: participant.id,
      username: normalizeUsername(participant.username),
      text: participant.text,
      createdAt: participant.createdAt.toISOString(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return hash(JSON.stringify(canonical));
}

function getProfileImageUrl(rawData: unknown) {
  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) return null;

  const value = (rawData as Record<string, unknown>).profileImageUrl;
  if (typeof value !== "string") return null;

  return /^https?:\/\//.test(value) ? value : null;
}

function serializeDrawParticipant(comment: {
  id: string;
  username: string;
  text: string;
  rawData: Prisma.JsonValue | null;
}) {
  return {
    id: comment.id,
    username: comment.username,
    text: comment.text,
    profileImageUrl: getProfileImageUrl(comment.rawData),
  };
}

export async function drawGiveaway(giveawayId: string) {
  const giveaway = await prisma.giveaway.findUnique({
    where: { id: giveawayId },
    include: {
      drawResults: true,
      comments: {
        where: { isValid: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
  });

  if (!giveaway) {
    throw new Error("Sorteio não encontrado.");
  }

  if (giveaway.drawResults.length > 0 || giveaway.status === "drawn") {
    throw new Error("Este sorteio já possui resultado registrado.");
  }

  const participants = giveaway.oneChancePerUser
    ? Array.from(
        new Map(giveaway.comments.map((comment) => [normalizeUsername(comment.username), comment])).values(),
      )
    : giveaway.comments;

  if (participants.length === 0) {
    throw new Error("Não há participantes válidos para sortear.");
  }

  const seed = crypto.randomBytes(32).toString("hex");
  const participantsHash = buildParticipantsHash(participants);
  const shuffled = [...participants].sort((a, b) => {
    const left = hash(`${seed}:${a.id}:${normalizeUsername(a.username)}:${a.text}`);
    const right = hash(`${seed}:${b.id}:${normalizeUsername(b.username)}:${b.text}`);
    return left.localeCompare(right);
  });

  const winners = shuffled.slice(0, giveaway.winnersCount);
  const alternates = shuffled.slice(giveaway.winnersCount, giveaway.winnersCount + giveaway.alternatesCount);

  await prisma.$transaction(async (tx) => {
    await tx.drawResult.createMany({
      data: [
        ...winners.map((comment, index) => ({
          giveawayId,
          commentId: comment.id,
          username: comment.username,
          position: index + 1,
          type: "winner",
        })),
        ...alternates.map((comment, index) => ({
          giveawayId,
          commentId: comment.id,
          username: comment.username,
          position: index + 1,
          type: "alternate",
        })),
      ],
    });

    await tx.giveaway.update({
      where: { id: giveawayId },
      data: {
        status: "drawn",
        drawSeed: seed,
        participantsHash,
        drawnAt: new Date(),
      },
    });
  });

  await registerAuditLog({
    giveawayId,
    action: "giveaway_drawn",
    payload: {
      winners: winners.length,
      alternates: alternates.length,
      seed,
      participantsHash,
    },
  });

  return {
    seed,
    participantsHash,
    winners: winners.map(serializeDrawParticipant),
    alternates: alternates.map(serializeDrawParticipant),
  };
}
