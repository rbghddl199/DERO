// 웜옐로우 장식용 배경 발광 — 홈 화면과 동일한 블러 그라데이션 원 두 개. 페이지 최상위 wrapper에
// `relative overflow-hidden`과 함께 두고, 실제 콘텐츠보다 먼저(DOM상 앞에) 렌더해야 뒤로 깔린다.

const DecorGlowBackground = () => {
  return (
    <>
      {/* TopNav 바로 아래 간접 조명 — 형광등 패널의 두 요소를 흉내낸다: ①광원 자체(가는 라인,
          가운데가 가장 밝고 blur 약함) ②그 빛이 아래 벽면에 퍼지는 확산광(넓고 blur 강함, 배경
          `bg-paper`(#fff) 위에서도 보이게 decor-yellow를 낮은 opacity로 은은히 섞는다).
          홈에만(이 컴포넌트가 홈에서만 쓰인다) */}
      <div
        aria-hidden
        className="via-decor-yellow/70 pointer-events-none absolute inset-x-8 top-0 h-[3px] bg-gradient-to-r from-transparent to-transparent blur-[2px] sm:inset-x-24"
      />
      <div
        aria-hidden
        className="from-decor-yellow/30 pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b to-transparent blur-3xl"
      />
      <div
        aria-hidden
        className="from-decor-yellow via-decor-peach to-decor-ivory pointer-events-none absolute -top-40 -right-40 h-[560px] w-[560px] rounded-full bg-gradient-to-br opacity-60 blur-3xl"
      />
      <div
        aria-hidden
        className="bg-decor-ivory pointer-events-none absolute top-32 -left-32 h-[360px] w-[360px] rounded-full opacity-70 blur-3xl"
      />
    </>
  );
};

export default DecorGlowBackground;
