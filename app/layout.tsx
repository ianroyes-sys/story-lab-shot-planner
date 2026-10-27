import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Story Lab",
  description: "Turn real work into a shootable build-in-public video: treatment, shot list, rehearsal timer and shoot brief.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
