import "./globals.css";
import { Inter } from "next/font/google";
import AppShell from "@/components/AppShell";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Pour Choices",
  description: "Picture Your Next Sip",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} h-screen flex flex-col bg-ivory`}>
        {/* Implemented fixed header/footer with scrollable middle per user spec */}
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
