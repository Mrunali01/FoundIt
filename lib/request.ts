import type { NextRequest } from "next/server";
// Next may normalize the internal URL hostname. Host retains the browser-facing
// authority, including the development port. Do not trust forwarded-host here.
export function sameOrigin(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    if (!origin) return false;
    const url = new URL(origin);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      url.host === req.headers.get("host")
    );
  } catch {
    return false;
  }
}
