const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
export async function retryFileReplace(
  replace: () => Promise<void>,
  wait: typeof delay = delay,
) {
  for (let attempt = 0; ; attempt++) {
    try {
      await replace();
      return;
    } catch (e) {
      if (
        !["EPERM", "EBUSY", "EACCES"].includes(
          (e as NodeJS.ErrnoException).code || "",
        ) ||
        attempt >= 7
      )
        throw e;
      await wait(25 * 2 ** attempt);
    }
  }
}
