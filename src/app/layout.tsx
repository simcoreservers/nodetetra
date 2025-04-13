"use client";

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SidebarProvider } from "./components/SidebarContext";

const inter = Inter({ subsets: ["latin"] });

// Client components cannot use Node.js modules like child_process
// Remove server initialization from client component

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <title>NuTetra Hydroponics Controller</title>
        <meta name="description" content="Advanced automation for hydroponic, aquaponic, and soil-based growing systems" />
      </head>
      <body className={inter.className}>
        <SidebarProvider>
          {children}
        </SidebarProvider>
      </body>
    </html>
  );
}
