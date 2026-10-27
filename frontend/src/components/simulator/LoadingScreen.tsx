'use client';
// 로딩 화면 — 엔진 초기화(에셋 프리로드)가 끝나 store.ready가 true가 되기 전까지 노출

const LoadingScreen = () => {
  return (
    <section className="screen screen-loading active" data-testid="screen-loading">
      <div className="glass hero-card">
        <svg className="spinner" viewBox="0 0 44 44" aria-hidden>
          <circle className="spinner-track" cx="22" cy="22" r="18" />
          <circle className="spinner-arc" cx="22" cy="22" r="18" />
        </svg>
        <p className="h2">불러오는 중…</p>
        <p className="muted">3D 에셋을 준비하고 있어요</p>
      </div>
    </section>
  );
};

export default LoadingScreen;
