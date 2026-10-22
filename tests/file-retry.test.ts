import { it, expect, vi } from "vitest";
import { retryFileReplace } from "../lib/file-retry";
it("retries temporary Windows locks without deleting the durable file", async () => {
  const locked = Object.assign(new Error("locked"), { code: "EPERM" });
  const rename = vi
    .fn<() => Promise<void>>()
    .mockRejectedValueOnce(locked)
    .mockRejectedValueOnce(locked)
    .mockResolvedValue(undefined);
  const wait = vi.fn(async () => {});
  await retryFileReplace(rename, wait);
  expect(rename).toHaveBeenCalledTimes(3);
  expect(wait.mock.calls).toEqual([[25], [50]]);
});
it("bounds retries when a file remains locked", async () => {
  const locked = Object.assign(new Error("locked"), { code: "EBUSY" });
  const rename = vi.fn(async () => {
    throw locked;
  });
  await expect(retryFileReplace(rename, async () => {})).rejects.toBe(locked);
  expect(rename).toHaveBeenCalledTimes(8);
});
it("immediately rejects permanent filesystem failures", async () => {
  const error = Object.assign(new Error("disk full"), { code: "ENOSPC" });
  const rename = vi.fn(async () => {
    throw error;
  });
  await expect(retryFileReplace(rename, async () => {})).rejects.toBe(error);
  expect(rename).toHaveBeenCalledTimes(1);
});
