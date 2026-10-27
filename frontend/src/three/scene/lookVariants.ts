// 발광 룩 변형 테이블 (DERO-162) — 블룸/글레어 파라미터 프리셋을 HUD에서 실시간 전환해 아트디렉션을 판정한다.

/** 한 변형 = postfx의 두 블룸 항에 그대로 쓰이는 파라미터 묶음.
 *  ① bloom  = emissive MRT 항 — "스스로 빛나는 표면" 전담, 조명 리그와 무관.
 *  ② glare  = 핫스팟 항 — "빛을 받아 밝은 면"(램프 웅덩이 등) 전담. */
export interface LookVariant {
  id: string;
  /** HUD 칩에 찍히는 짧은 한국어 표기. */
  label: string;
  /** 판정 시트에 옮겨 적는 의도 한 문장 — 왜 이 값을 후보로 두는가. */
  intent: string;
  bloom: { strength: number; radius: number };
  glare: { strength: number; threshold: number };
}

/** 초기 룩 — 스토어가 init에서 이 id로 postfx를 한 번 세팅해, 이 테이블이 튜닝 값의 단일 정본이 된다. */
export const DEFAULT_LOOK_ID = 'current';

/** 모든 변형에서 glare.threshold는 50 고정이다. pre-tonemap 선형 휘도라 방 조명 리그와 짝인데,
 *  흰 벽 천장이 21~22이고 램프 웅덩이가 150~170이다. 문턱을 벽 천장의 2배 미만으로 내리면
 *  벽 전체가 글레어를 먹어 변형 간 비교 자체가 무의미해진다 (`src/three/CLAUDE.md`
 *  "블룸은 항이 두 개고 성질이 정반대다" 항목). 변형이 조절하는 것은 glare.strength뿐이다. */
export const LOOK_VARIANTS: readonly LookVariant[] = [
  {
    id: 'flat',
    label: '무블룸',
    intent:
      '블룸 완전 오프 — emissive와 스필 PointLight만. glb-rendering-guide §1 "bloom 미승인" 현행 문서 상태의 앵커',
    bloom: { strength: 0, radius: 0.6 },
    glare: { strength: 0, threshold: 50 },
  },
  {
    id: 'whisper',
    label: '은은',
    intent: '존재만 알리는 최소 halo — painterly 보수 후보',
    bloom: { strength: 0.5, radius: 0.35 },
    glare: { strength: 0.3, threshold: 50 },
  },
  {
    // postfx.ts의 기본 유니폼 값과 반드시 일치해야 한다 — 이 줄이 어긋나면 초기 화면과
    // '현행' 칩을 누른 화면이 달라져 기각된 룩의 기준점이 사라진다 (tests/lookVariants.test.ts가 가드).
    id: 'current',
    label: '현행',
    intent: '2026-07-26 판정 확정 — 은은·소프트 중간값 (DERO-162)',
    bloom: { strength: 0.75, radius: 0.6 },
    glare: { strength: 0.4, threshold: 50 },
  },
  {
    id: 'tight',
    label: '타이트',
    intent: '좁고 진한 halo — 카툰 스티커 느낌의 painterly 후보',
    bloom: { strength: 1.8, radius: 0.3 },
    glare: { strength: 0.4, threshold: 50 },
  },
  {
    id: 'soft',
    label: '소프트',
    intent: '넓고 옅은 번짐 — 레퍼런스 네온 무드 지향',
    bloom: { strength: 1.0, radius: 0.85 },
    glare: { strength: 0.5, threshold: 50 },
  },
  {
    id: 'lamp',
    label: '램프',
    intent:
      '글레어 강조 — 램프 웅덩이가 광원으로 읽히는 쪽. 방조명 OFF에서 램프 옆 벽 +11% 헤이즈를 감수하는 룩',
    bloom: { strength: 0.8, radius: 0.5 },
    glare: { strength: 1.0, threshold: 50 },
  },
];

/** id로 변형을 찾는다 — 미지 id는 undefined(스토어가 이걸로 false를 돌려준다). */
export function findLookVariant(id: string): LookVariant | undefined {
  return LOOK_VARIANTS.find((v) => v.id === id);
}
