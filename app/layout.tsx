import type { Metadata } from "next";

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
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
