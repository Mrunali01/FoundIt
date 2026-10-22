import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "FoundIt — Bring it home",
  description:
    "Your campus, connected. Report, discover and safely recover lost belongings.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
