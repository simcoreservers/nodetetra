"use client";

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SidebarProvider } from "./components/SidebarContext";
import { SimulationProvider } from "./components/SimulationContext";
import { NetworkProvider } from "./components/NetworkContext";
import { KeyboardProvider } from "@/components/ui/keyboard";
import { Keyboard } from "@/components/ui/keyboard";

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
          <SimulationProvider>
            <NetworkProvider>
              <Keyboard>
                {children}
              </Keyboard>
            </NetworkProvider>
          </SimulationProvider>
        </SidebarProvider>
      </body>
    </html>
  );
}
