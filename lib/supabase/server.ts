import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export const isDemo = () => {
  const mode = process.env.FOUNDIT_MODE || "demo";
  if (!["demo", "supabase"].includes(mode))
    throw Error("Set FOUNDIT_MODE to demo or supabase");
  if (
    mode === "supabase" &&
    (!process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  )
    throw Error("Supabase configuration is incomplete");
  return mode === "demo";
};
export async function supabase() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll(values) {
          for (const v of values) jar.set(v.name, v.value, v.options);
        },
      },
    },
  );
}
