import type { Metadata, Viewport } from "next";
import { QueryProvider } from "@/components/query-provider";
import "./globals.css";
import { Inter, Figtree } from "next/font/google";
import { cn } from "@/lib/utils";

const figtreeHeading = Figtree({subsets:['latin'],variable:'--font-heading'});

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Little Cloud Photo Booth",
  description: "A photo booth for a special baby shower.",
  appleWebApp: { capable: true, title: "Little Cloud" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#568eae" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn("h-full antialiased", "font-sans", inter.variable, figtreeHeading.variable)}>
      <body className="flex min-h-full flex-col font-[Arial,sans-serif]">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
