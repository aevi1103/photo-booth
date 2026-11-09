import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Little Cloud Photo Booth",
  description: "A photo booth for a special baby shower.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
