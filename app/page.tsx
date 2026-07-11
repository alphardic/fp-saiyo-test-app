export default function HomePage() {
  return (
    <main style={{ padding: 40, maxWidth: 640, margin: "0 auto" }}>
      <h1>FP業界 入社適性テスト</h1>
      <p>
        受験者の方は、管理者から送付された受験用リンク(/exam/[トークン])からアクセスしてください。
      </p>
      <p>
        管理者の方は <a href="/admin/login">こちら</a> からログインしてください。
      </p>
    </main>
  );
}
