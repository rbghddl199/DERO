// 장식 발광 순수 로직 — 색 결정(recolorable)과 PointLight 캡 배정(카메라 근접순), three 임포트 없음 (ADR-0003)

/**
 * `asset.emitter_manifest` (JSONB)의 프론트엔드 미러. **키 이름이 스키마 정본과
 * 1:1이라야 한다** — WAS가 변환 계층 없이 그대로 넘긴다 (docs/context/erd.md `asset` 절).
 */
export interface EmitterManifest {
  /** true = 가변 발광(색은 배치 인스턴스가 지배) / false = 고정 발광(제품 속성) */
  recolorable: boolean;
  /** 고정 발광의 최종색이자 가변 발광의 초기값. `'#RRGGBB'` */
  defaultColor: string;
  /** **저작 추정 광속**(lm) — 규격의 정격 광속이 아니다. PointLight.power로 직행 */
  lumens: number;
  /** 스필 도달 반경(mm) → PointLight.distance. 장식 발광은 국소라 300~600mm대 */
  radiusMm: number;
  /** 발광체 위치(m, 아이템 그룹 로컬). **생략하면 bbox 중심** (ADR-0003 결정 4) */
  point?: [number, number, number];
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * 발광체의 실효 색 `'#RRGGBB'`.
 *
 * `recolorable`이 정본이고 인스턴스 색은 종속이다 — `false`면 값이 들어 있어도
 * 무시하고 `defaultColor`를 쓴다(고정 발광의 색은 제품 정체성의 일부).
 * `true`면 인스턴스 색이 이기고, 아직 고르지 않았으면 `defaultColor`로 폴백한다.
 * (erd.md `placed_item.emitter_color`, ADR-0003 결정 3)
 */
export function resolveEmitterColor(manifest: EmitterManifest, instanceColor?: string): string {
  if (!manifest.recolorable) return manifest.defaultColor;
  if (instanceColor && HEX_COLOR.test(instanceColor)) return instanceColor;
  return manifest.defaultColor;
}

/**
 * 동시에 살아 있는 장식 발광 PointLight 하드 캡 (`LAMP_SHADOW_CAP`과 같은 자리).
 * 초과분은 emissive만 남고 스필이 없다.
 *
 * WebGL2 폴백이 더 낮은 이유: 광원 하나가 셰이더 유니폼·루프 분기 비용에 직결되고
 * SwiftShader e2e는 소프트웨어 래스터라 광원 추가 비용이 그대로 프레임에 실린다
 * (ADR-0003 결정 6이 별도 캡을 명시적으로 허용한다).
 */
export const EMITTER_LIGHT_CAP: Record<'webgpu' | 'webgl', number> = {
  webgpu: 6,
  webgl: 3,
};

/**
 * 발광체별 카메라 거리 → PointLight를 살릴지 여부. 가까운 것부터 `cap`개.
 *
 * 램프 슬롯 배정(`lampSlotOrder` — 실효 lm 순)과 **일부러 다르다**: 램프 그림자는 어디 있든 씬
 * 전체에 영향이라 순서로 충분하지만, 발광 스필은 국소(30~60cm)라 화면 밖
 * 발광체의 기여가 어차피 보이지 않는다 (ADR-0003 결정 6).
 *
 * 동거리 타이는 낮은 인덱스가 이긴다 — 정렬이 안정적이라 같은 씬이 프레임마다
 * 다른 배정으로 깜빡이지 않는다.
 */
export function emitterLightFlags(distances: number[], cap: number): boolean[] {
  const order = distances.map((_, i) => i);
  order.sort((a, b) => distances[a] - distances[b] || a - b);
  const flags = distances.map(() => false);
  const live = Math.max(0, Math.min(cap, order.length));
  for (let i = 0; i < live; i++) flags[order[i]] = true;
  return flags;
}

/**
 * emissive를 칠할 메쉬만 고른다 — **표시된 것이 있으면 그것만, 하나도 없으면 전부**.
 *
 * 발광은 국소다: 키보드는 케이스가 아니라 키캡 아래 플레이트가 빛난다. 어느 메쉬가
 * 빛나는지는 형상을 아는 쪽이 정한다 — 절차형 소품은 지오메트리 생성 코드가
 * `userData` 플래그로 표시하고(메쉬 **이름**이 아니다: `rig_manifest`가 파트 개명에
 * 깨지는 취약성을 발광에 들이지 않는다, erd.md `emitter_manifest.point` 절),
 * GLB 에셋은 빌드타임 텍셀 마스크가 맡는다(ADR-0003 결정 3, 별건 티켓).
 *
 * 폴백이 정확히 그 별건까지의 다리다 — 표시가 없는 GLB 발광체는 지금과 똑같이
 * 전 메쉬가 빛난다. 조용히 썩기 쉬운 규칙이라 인라인이 아니라 여기서 테스트를 받는다.
 */
export function selectEmitterMeshes<T>(
  candidates: readonly T[],
  isFlagged: (mesh: T) => boolean,
): T[] {
  const flagged = candidates.filter(isFlagged);
  return flagged.length > 0 ? flagged : [...candidates];
}
