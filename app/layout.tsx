import type { Metadata } from "next";
import { Inter, Press_Start_2P } from "next/font/google";
import { SITE } from "@/lib/site";
import "./globals.css";

const sans = Inter({ variable: "--font-sans-face", subsets: ["latin"] });
const pixel = Press_Start_2P({
  variable: "--font-pixel-face",
  subsets: ["latin"],
  weight: "400",
});

const title = `${SITE.cartridge} — ${SITE.name}`;
const description = `A handheld console you can actually play. Climb the tree, reach the top, and find out why it exists. An application to ${SITE.event} ${SITE.year}.`;

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${pixel.variable} h-full`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
