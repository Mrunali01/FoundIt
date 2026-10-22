import { FoundItApp } from "@/components/foundit-app";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug = [] } = await params;
  const input = await searchParams;
  const query = Object.fromEntries(
    Object.entries(input).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  return (
    <FoundItApp
      key={"/" + slug.join("/")}
      route={"/" + slug.join("/")}
      query={query}
    />
  );
}
