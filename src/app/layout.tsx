import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daily English",
  description: "Read English paragraphs and learn new words",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
