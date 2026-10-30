import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { Bar } from "@/components/Bar";
import { Footer } from "@/components/Footer";
import { DESCRIPTION } from "@/lib/site";
import { DEFAULT_THEME, THEME_KEY } from "@/lib/theme";
import "./themes.css";
import "./styles.css";

// latin-ext has the ō in the name.
const mono = JetBrains_Mono({ subsets: ["latin", "latin-ext"], variable: "--mono" });

// Runs before anything's drawn, so a page never flashes the wrong theme.
const REMEMBER_THEME = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export const metadata: Metadata = {
  title: { default: "Byōbu: a wall display OS for the Raspberry Pi", template: "%s · Byōbu" },
  description: DESCRIPTION,
  openGraph: { title: "Byōbu", description: DESCRIPTION, type: "website" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme={DEFAULT_THEME} className={mono.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: REMEMBER_THEME }} />
      </head>
      <body>
        <a className="skip" href="#content">Skip to content</a>
        <Bar />
        <main id="content">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
