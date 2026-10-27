package com.brunchies.dero.product;

import java.util.List;
import java.util.Map;

/**
 * {@code asset.rig_manifest} JSONB — D16 리그 매니페스트(ADR-0002).
 *
 * <p><b>관절 정의의 정본은 규격 DB지 메쉬가 아니다.</b> 런타임 클램프는 언제나 이 매니페스트를 보고,
 * {@code arm}의 각도 컬럼은 카탈로그 표기·필터 전용이다 — 둘이 어긋나면 매니페스트가 씬을 지배한다.
 *
 * <p><b>실제 소비자는 프론트 Three.js다</b>(ADR-0006 결정 3). 필드 구성의 정본은
 * {@code frontend/src/three/scene/product.ts}의 {@code RigManifest} 타입이고, 값 검증은
 * {@code validateManifest()}({@code frontend/src/three/core/rig.ts})가 등록 게이트로 한다.
 * 호환성 판정에는 쓰이지 않는다.
 *
 * <p><b>부분 갱신하지 않고 통째 교체만 한다</b> — 이 레코드에 없는 필드는 역직렬화에서 사라지므로,
 * 읽어서 일부만 고쳐 다시 쓰면 프론트가 추가한 필드가 조용히 유실된다(ADR-0006 결정 3).
 *
 * @param segments 논리 세그먼트 → GLB 노드 이름 목록. 노드 이름은 안정 이름이라 개명이 곧 파괴적 변경이다
 * @param joints 관절 목록. 종류별 필수·금지 필드는 {@link Joint} 참고
 * @param supportPart 지지 세그먼트 — 이 파트 footprint만 상판 안이면 된다(상부 캔틸리버 허용). 없으면 NULL
 * @param mountPart 결합 세그먼트 — 다른 제품(모니터)이 물리는 파트, 자석 결합의 부모가 된다(D22)
 */
public record RigManifest(
    Map<String, List<String>> segments,
    List<Joint> joints,
    String supportPart,
    String mountPart) {

  /**
   * 관절 하나 — 회전(revolute, 도) / 직선(prismatic, mm)의 판별 유니온이다(ADR-0002 결정 1).
   *
   * <p><b>한계 필드는 종류가 소유한다</b>: revolute는 {@code minDeg}·{@code maxDeg}, prismatic은
   * {@code minMm}·{@code maxMm}이고 서로의 필드를 갖지 않는다. 그래서 넷 다 nullable이다 — 이름이
   * 단위를 말하지 않는 {@code min}/{@code max} 한 쌍으로 합치면 "prismatic인데 minDeg를 적었다"를
   * 기계가 잡을 수 없다(ADR-0002 결정 8-1).
   *
   * @param joint 매니페스트 안에서 유일한 관절 id({@code 'elbow-pitch'})
   * @param label 조작 UI·gizmo 툴팁이 쓰는 한글 표시명. <b>필수</b> — 비면 화면에 내부 id가 뜬다
   * @param parent {@code segments}의 부모 세그먼트 키
   * @param child 이 관절이 구동하는 자식 세그먼트 키
   * @param axis GLB 루트 좌표계의 단위 벡터 {@code [x, y, z]} — 회전축이자 직선 이동 방향
   * @param point GLB 루트 좌표계의 피벗점 {@code [x, y, z]}(m, 균일 스케일 전)
   * @param kind {@code 'revolute'} / {@code 'prismatic'}. <b>생략(NULL) = revolute</b> — 다수 쪽을
   *     기본값으로 둬서 기존 매니페스트가 그대로 통과한다. 프론트 JSON 리터럴이 소문자라 Java enum이
   *     아니라 문자열로 받는다
   * @param minDeg revolute 전용 하한(도). prismatic이면 NULL이어야 한다
   * @param maxDeg revolute 전용 상한(도)
   * @param minMm prismatic 전용 하한(mm) — 전역 규격 단위가 mm라 사람이 mm로 적고 런타임이 {@code /1000}
   *     으로 GLB 미터 좌표계에 맞춘다. revolute면 NULL이어야 한다
   * @param maxMm prismatic 전용 상한(mm)
   * @param coupledTo 종속 관절이면 driver 지정. 아니면 NULL
   */
  public record Joint(
      String joint,
      String label,
      String parent,
      String child,
      List<Double> axis,
      List<Double> point,
      String kind,
      Double minDeg,
      Double maxDeg,
      Double minMm,
      Double maxMm,
      Coupling coupledTo) {
  }

  /**
   * 종속 관절 — "나는 {@code joint}를 따라간다"(ADR-0002 결정 2).
   *
   * <p>종속값은 {@code driver × ratio + offset}으로 <b>로드 시 재계산</b>하고 저장하지 않는다 —
   * 저장하면 ratio를 고친 날 두 값이 어긋나고 어긋난 쪽이 렌더를 지배한다.
   *
   * @param joint driver 관절 id. 자기 자신이면 안 되고, <b>driver가 스스로 종속이어도 안 된다</b>
   *     (체인 금지 — 재계산이 2패스라 체인은 조용히 한 단계 뒤처진 값을 만든다)
   * @param ratio driver 값에 곱하는 비율(유한수)
   * @param offset 더하는 상수. 없으면 NULL
   */
  public record Coupling(
      String joint,
      Double ratio,
      Double offset) {
  }
}
