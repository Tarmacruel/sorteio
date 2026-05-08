import "dotenv/config";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { captureInstagramComments } from "@/services/instagram-capture.service";
import { prisma } from "@/lib/db";
import { registerAuditLog } from "@/services/audit.service";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  "instagram-capture",
  async (job) => {
    const data = job.data as {
      giveawayId: string;
      postUrl: string;
      captureJobId: string;
    };

    await prisma.instagramCaptureJob.update({
      where: { id: data.captureJobId },
      data: {
        status: "running",
        startedAt: new Date(),
      },
    });

    const result = await captureInstagramComments(data);

    await registerAuditLog({
      giveawayId: data.giveawayId,
      action: "worker_capture_job_completed",
      payload: {
        bullJobId: job.id,
        captureJobId: data.captureJobId,
        ...result,
      },
    });

    return result;
  },
  {
    connection,
    concurrency: 1,
  },
);

worker.on("failed", async (job, error) => {
  const data = job?.data as
    | {
        giveawayId: string;
        captureJobId: string;
      }
    | undefined;

  if (!data) return;

  await prisma.instagramCaptureJob
    .update({
      where: { id: data.captureJobId },
      data: {
        status: "failed",
        finishedAt: new Date(),
        errorMessage: error.message,
      },
    })
    .catch(() => undefined);

  await registerAuditLog({
    giveawayId: data.giveawayId,
    action: "worker_capture_job_failed",
    payload: {
      bullJobId: job?.id,
      captureJobId: data.captureJobId,
      errorMessage: error.message,
    },
  }).catch(() => undefined);
});

worker.on("completed", (job) => {
  console.log(`Capture job ${job.id} completed.`);
});

worker.on("failed", (job, error) => {
  console.error(`Capture job ${job?.id ?? "unknown"} failed: ${error.message}`);
});

process.on("SIGINT", async () => {
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
});

console.log("Instagram capture worker running on queue instagram-capture.");
