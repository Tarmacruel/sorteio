import { Queue } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const queueUnavailableMessage =
  "Não foi possível conectar ao Redis local. Inicie o Redis em localhost:6379 e execute o worker de captura.";

let connection: IORedis | null = null;
let instagramCaptureQueue: Queue | null = null;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function getRedisConnection() {
  if (!connection) {
    connection = new IORedis(redisUrl, {
      connectTimeout: 3000,
      enableOfflineQueue: false,
      maxRetriesPerRequest: null,
      retryStrategy: () => null,
    });
    connection.on("error", () => undefined);
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
  const queue = getInstagramCaptureQueue();

  await withTimeout(queue.waitUntilReady(), 3500, queueUnavailableMessage);

  return withTimeout(
    queue.add("capture", input, {
      jobId: input.captureJobId,
    }),
    5000,
    queueUnavailableMessage,
  );
}

export async function removeInstagramCaptureJob(jobId: string) {
  const queue = getInstagramCaptureQueue();

  await withTimeout(queue.waitUntilReady(), 3500, queueUnavailableMessage);

  const job = await queue.getJob(jobId).catch(() => null);
  await job?.remove().catch(() => undefined);
}
