export default function HomePage() {
  return (
    <main className="page page-narrow">
      <div className="page-header">
        <h1>FP業界 入社適性テスト</h1>
        <p>金融・保険・不動産・税務など、FPに求められる知識を測る適性テストです。</p>
      </div>

      <div className="card">
        <div className="section">
          <div className="section-title">
            <span className="dot" />
            <h2>受験者の方</h2>
          </div>
          <p className="text-muted">
            管理者から送付された受験用リンク(URL)からアクセスしてください。
            このページから直接受験することはできません。
          </p>
        </div>

        <div className="section" style={{ marginBottom: 0 }}>
          <div className="section-title">
            <span className="dot" />
            <h2>管理者の方</h2>
          </div>
          <a href="/admin/login" className="btn btn-primary">
            管理者ログインへ進む
          </a>
        </div>
      </div>
    </main>
  );
}