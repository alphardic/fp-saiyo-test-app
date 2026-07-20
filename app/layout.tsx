import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FP業界 入社適性テスト",
  description: "FP業界向け入社適性テストアプリ",
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
            <div className="topbar-mark">FP</div>
            <div>
              <div className="topbar-title">FP業界 入社適性テスト</div>
              <div className="topbar-sub">Financial Planner Aptitude Test</div>
            </div>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}