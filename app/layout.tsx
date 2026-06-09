import type { Metadata } from "next";
import { Noto_Sans_Mono } from "next/font/google";
import { AppProviders } from "./providers";
import "katex/dist/katex.min.css";
import "./globals.css";

const notoSansMono = Noto_Sans_Mono({
  subsets: ["latin", "cyrillic"],
  variable: "--font-noto-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pi-Agent",
  description: "Pi Coding Agent Web Interface",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Pi Web",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={notoSansMono.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("pi-theme");if(t==="dark")document.documentElement.classList.add("dark");var l=localStorage.getItem("pi-web.locale");if(l!=="en"&&l!=="zh-CN"){var n=(navigator.languages&&navigator.languages[0])||navigator.language||"en";l=/^zh/i.test(n)?"zh-CN":"en";}document.documentElement.lang=l;}catch(e){}})();`,
          }}
        />
      </head>
      <body style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
