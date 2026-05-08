import { Queue } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

let connection: IORedis | null = null;
let instagramCaptureQueue: Queue | null = null;

function getRedisConnection() {
  if (!connection) {
    connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
    });
  }

  return connection;
}

export function getInstagramCaptureQueue() {
  if (!instagramCaptureQueue) {
    instagramCaptureQueue = new Queue("instagram-capture", {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: {
          age: 60 * 60 * 24,
          count: 100,
        },
        removeOnFail: {
          age: 60 * 60 * 24 * 7,
          count: 500,
        },
      },
    });
  }

  return instagramCaptureQueue;
}

export async function enqueueInstagramCapture(input: {
  giveawayId: string;
  postUrl: string;
  captureJobId: string;
}) {
  return getInstagramCaptureQueue().add("capture", input, {
    jobId: input.captureJobId,
  });
}

export async function removeInstagramCaptureJob(jobId: string) {
  const job = await getInstagramCaptureQueue()
    .getJob(jobId)
    .catch(() => null);
  await job?.remove().catch(() => undefined);
}
