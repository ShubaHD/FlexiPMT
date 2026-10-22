import type { Metadata } from "next";
import { DM_Sans, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const source = Source_Sans_3({
  subsets: ["latin", "latin-ext"],
  variable: "--font-source",
});

const dm = DM_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-dm",
});

export const metadata: Metadata = {
  title: "FlexiPMT — Presiometrie OYO",
  description:
    "Gestionare, prelucrare și raportare încercări presiometrie OYO (ISO 22476-5)",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ro">
      <body className={`${source.variable} ${dm.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
