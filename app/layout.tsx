import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "金融リテラシーチェックテスト",
  description: "Supported by Alpha Financial Planners",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <div className="topbar">
          <div className="topbar-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Alpha Financial Planners" className="topbar-mark" />
            <div>
              <div className="topbar-title">金融リテラシーチェックテスト</div>
              <div className="topbar-sub">Supported by Alpha Financial Planners</div>
            </div>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}