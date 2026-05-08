import fs from "node:fs";
import path from "node:path";

export function getInstagramAuthStatePath() {
  const configuredPath = process.env.INSTAGRAM_AUTH_STATE_PATH ?? "storage/instagram-auth.json";
  return path.isAbsolute(configuredPath) ? configuredPath : path.resolve(process.cwd(), configuredPath);
}

export function getInstagramAuthStateStatus() {
  const authStatePath = getInstagramAuthStatePath();
  const exists = fs.existsSync(authStatePath);
  const stat = exists ? fs.statSync(authStatePath) : null;

  return {
    exists,
    path: authStatePath,
    updatedAt: stat?.mtime.toISOString() ?? null,
  };
}
