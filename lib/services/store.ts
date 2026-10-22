import "server-only";
import { mkdir, readFile, writeFile, rename, rmdir } from "node:fs/promises";
import path from "node:path";
import { seed } from "../seed";
import { scorePair } from "../matching";
import type { Store } from "../types";
import { dataDirectory } from "../data-directory";
import { retryFileReplace } from "../file-retry";
const directory = dataDirectory();
const file = path.join(directory, "demo.json");
let queue: Promise<unknown> = Promise.resolve();
export function refreshMatches(s: Store) {
  const previous = new Set(s.matches.map((m) => m.id));
  s.matches = [];
  for (const lost of s.reports.filter((r) => r.type === "lost"))
    for (const found of s.reports.filter((r) => r.type === "found")) {
      const result = scorePair(lost, found);
      if (!result || result.score < 40) continue;
      const id = `${lost.id}:${found.id}`;
      s.matches.push({
        id,
        lost_report_id: lost.id,
        found_report_id: found.id,
        ...result,
      });
      if (
        result.score >= Number(process.env.MATCH_THRESHOLD || 65) &&
        !previous.has(id)
      )
        for (const report of [lost, found]) {
          const key = `match:${id}:${report.reporter_id}`;
          if (
            !s.notifications.some((n) => n.id === key) &&
            s.profiles.find((p) => p.id === report.reporter_id)
              ?.match_notifications !== false
          )
            s.notifications.push({
              id: key,
              user_id: report.reporter_id,
              title: "A possible match is waiting",
              body: `${result.score} similarity score. Review the details before claiming.`,
              report_id: report.id,
              read: false,
              created_at: new Date().toISOString(),
            });
        }
    }
  return s;
}
export function transaction<T>(fn: (s: Store) => T | Promise<T>): Promise<T> {
  const next = queue.then(async () => {
    await mkdir(directory, { recursive: true });
    // Atomic directory lock also serializes separate Next route bundles/processes.
    const lock = path.join(directory, "write.lock");
    const deadline = Date.now() + 10000;
    while (true) {
      try {
        await mkdir(lock);
        break;
      } catch (e) {
        if (
          (e as NodeJS.ErrnoException).code !== "EEXIST" ||
          Date.now() > deadline
        )
          throw Error("Demo store busy. Please retry.");
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    try {
      let s: Store;
      let original: string | undefined;
      try {
        original = await readFile(file, "utf8");
        s = JSON.parse(original) as Store;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        s = refreshMatches(seed());
      }
      const result = await fn(s);
      const serialized = JSON.stringify(s);
      if (serialized !== original) {
        await writeFile(file + ".tmp", serialized);
        // Windows antivirus/indexing may briefly hold a closed file handle.
        // Keep the writer lock and retry without deleting the durable original.
        await retryFileReplace(() => rename(file + ".tmp", file));
      }
      return result;
    } finally {
      await rmdir(lock);
    }
  });
  queue = next.catch(() => undefined);
  return next;
}
