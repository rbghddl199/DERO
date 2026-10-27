-- 책상 외 카탈로그(모니터·모니터암·조명·소품) 시딩 — REQ-SIM-06 잔여 원인 수정.
--
-- 배경: frontend/src/constants/productCatalogMap.ts의 PRODUCT_ID_TO_SPEC_ID가 빈 {}라
-- 책상 외 모든 배치 아이템이 저장·재로드 양쪽에서 콘솔 경고와 함께 스킵된다(docs/SPEC.md
-- REQ-SIM-06, 2026-07-29 "백엔드 카탈로그 시딩 설계 완료, 착수 보류"). 이 스크립트가 그 시딩이다.
--
-- ADR-0006 결정 9 — 시딩 데이터는 Flyway 밖에 둔다: 이 파일은 db/migration 밖(모듈 루트
-- backend/dero-api/db/seed/)에 있고 Flyway 스캔 대상이 아니다.
--
-- 적용 순서: 로컬 Postgres가 Flyway로 V1(+V2) 스키마까지 뜬 뒤에 실행한다.
--   docker compose -f compose.data.yaml up -d   (레포 루트)
--   ./gradlew bootRun 로 한 번 부팅(Flyway 적용) 후 종료, 또는 이미 떠 있는 로컬 DB 사용
--   psql "postgresql://dero:<password>@127.0.0.1:5432/dero_be" -f db/seed/product-catalog-seed.sql
--
-- 데이터 출처: frontend/src/three/scene/product.ts(PRODUCTS)·glbLibrary.ts(GLB_LIBRARY).
-- 프론트 값이 그대로 옮겨진 컬럼(치수·VESA·광학 등)과 이 스크립트가 지어낸 placeholder(프론트에
-- 소스가 없는 컬럼)를 각 절에서 구분해 주석으로 밝힌다 — 실제 카탈로그 저작 전까지의 임시값이다.
--
-- 범위 밖(의도적 제외, 별도 후속 작업):
--   * asset 행(GLB 등록) — monitor-arm-white·decor-waves·GLB 라이브러리 12개는 실제 GLB 바이트가
--     아직 backend 스토리지에 없다. asset은 product에 대해 nullable(식별관계)이라 없어도 저장·복원
--     자체는 깨지지 않는다 — 이 스크립트가 고치는 증상(아이템이 배치 저장·재로드에서 사라짐)엔
--     asset 유무가 관여하지 않는다(프론트 렌더는 지금도 자기 로컬 catalog를 쓰지 backend asset을
--     fetch하지 않는다). 실제 GLB 업로드는 AdminProductAssetController의 presign 2단계로 별도 진행.
--   * ProductCatalogService.list()의 비-DESK specType 지원 확장 — 프론트가 이 제품들을 카탈로그
--     "목록 조회"로 가져오게 하려면 필요하지만, 지금 프론트 LibraryPanel은 하드코딩 배열을 쓰지
--     backend 목록 API를 호출하지 않는다. 이 시딩의 목적(저장·재로드에 실제 product 행이 있어야
--     한다)엔 불필요 — product.id가 유효한 FK 대상이면 충분하다.
--
-- 이 스크립트는 반복 실행하면 안 된다(PK 충돌) — 로컬 DB를 리셋했을 때만 다시 돌린다.


-- =====================================================================
-- 1. 카테고리 (신규 루트 9개, id 900~908 — 기존 낮은 시퀀스값과 안 겹치는 대역)
-- =====================================================================

INSERT INTO category (id, parent_id, name, description, display_order) VALUES
    (900, NULL, '모니터',   NULL, 10),
    (901, NULL, '모니터암', NULL, 11),
    (902, NULL, '조명',     NULL, 12),
    (903, NULL, '키보드',   NULL, 13),
    (904, NULL, '스피커',   NULL, 14),
    (905, NULL, '보틀',     NULL, 15),
    (906, NULL, '머그',     NULL, 16),
    (907, NULL, '식물',     NULL, 17),
    (908, NULL, '데코',     NULL, 18);  -- decor-waves·deskmat-900·GLB 라이브러리 12개 공용


-- =====================================================================
-- 2. 브랜드 (10개, id 920~929) — GLB 라이브러리 12개는 브랜드 없음(product.brand_id NULL)
-- =====================================================================

INSERT INTO brand (id, name, description, brand_url, logo_image_key) VALUES
    (920, '뷰텍',       NULL, NULL, NULL),
    (921, '암스탠드',   NULL, NULL, NULL),
    (922, '라이트크래프트', NULL, NULL, NULL),
    (923, '키보이드',   NULL, NULL, NULL),
    (924, '사운드웨이브', NULL, NULL, NULL),
    (925, '스틸웨어',   NULL, NULL, NULL),
    (926, '테이블웨어', NULL, NULL, NULL),
    (927, '그린데스크', NULL, NULL, NULL),
    (928, '오브제랩',   NULL, NULL, NULL),
    (929, '매트하우스', NULL, NULL, NULL);


-- =====================================================================
-- 3. VESA 규격 (2개, id 950~951) — monitor.ts의 vesa 문자열 '75x75'/'100x100' 파싱
-- =====================================================================

INSERT INTO vesa_spec (id, width_mm, height_mm) VALUES
    (950, 75, 75),
    (951, 100, 100);


-- =====================================================================
-- 4. product (24행, id 1000~1023) — 책상(1/51/101)과 안 겹치는 1000번대
--    product_url은 프론트에 소스가 없어 NULL — CATALOG 필수 규칙은 WAS(Admin*Service) 소관이고
--    DB엔 NOT NULL 제약이 없다(product 테이블 정의 참고). desk 시딩 테스트 픽스처도 같은 패턴.
-- =====================================================================

INSERT INTO product (id, source, owner_user_id, brand_id, category_id, spec_type, name, description, price_krw, product_url, status) VALUES
    (1000, 'CATALOG', NULL, 920, 900, 'MONITOR', '27인치 모니터',             NULL, 259000, NULL, 'ACTIVE'),
    (1001, 'CATALOG', NULL, 920, 900, 'MONITOR', '34인치 커브드 울트라와이드', NULL, 890000, NULL, 'ACTIVE'),
    (1002, 'CATALOG', NULL, 921, 901, 'ARM',     '화이트 모니터암',           NULL,  69000, NULL, 'ACTIVE'),
    (1003, 'CATALOG', NULL, 922, 902, 'LIGHT',   '웜 데스크 램프 2700K',      NULL,  39000, NULL, 'ACTIVE'),
    (1004, 'CATALOG', NULL, 922, 902, 'LIGHT',   '태스크 램프 5000K',         NULL,  49000, NULL, 'ACTIVE'),
    (1005, 'CATALOG', NULL, 923, 903, 'PROP',    'TKL 키보드',                NULL,  89000, NULL, 'ACTIVE'),
    (1006, 'CATALOG', NULL, 924, 904, 'PROP',    '북셸프 스피커',             NULL, 129000, NULL, 'ACTIVE'),
    (1007, 'CATALOG', NULL, 925, 905, 'PROP',    '스테인리스 보틀',           NULL,  25000, NULL, 'ACTIVE'),
    (1008, 'CATALOG', NULL, 926, 906, 'PROP',    '세라믹 머그',               NULL,  12000, NULL, 'ACTIVE'),
    (1009, 'CATALOG', NULL, 927, 907, 'PROP',    '데스크 플랜트',             NULL,  18000, NULL, 'ACTIVE'),
    (1010, 'CATALOG', NULL, 928, 908, 'PROP',    '블루 웨이브 오브제',        NULL,  45000, NULL, 'ACTIVE'),
    (1011, 'CATALOG', NULL, 929, 908, 'PROP',    '데스크 매트 900',           NULL,  22000, NULL, 'ACTIVE'),
    -- GLB 라이브러리 12개 — 이름 없는 자산이라 브랜드·가격 없음(glbLibrarySpecs.ts 자체가 priceKrw를 안 채운다).
    (1012, 'CATALOG', NULL, NULL, 908, 'PROP', 'GLB 오브젝트 glb-0001', NULL, NULL, NULL, 'ACTIVE'),
    (1013, 'CATALOG', NULL, NULL, 908, 'PROP', 'GLB 오브젝트 glb-0002', NULL, NULL, NULL, 'ACTIVE'),
    (1014, 'CATALOG', NULL, NULL, 908, 'PROP', 'GLB 오브젝트 glb-0003', NULL, NULL, NULL, 'ACTIVE'),
    (1015, 'CATALOG', NULL, NULL, 908, 'PROP', 'GLB 오브젝트 glb-0004', NULL, NULL, NULL, 'ACTIVE'),
    (1016, 'CATALOG', NULL, NULL, 908, 'PROP', 'GLB 오브젝트 glb-0005', NULL, NULL, NULL, 'ACTIVE'),
    (1017, 'CATALOG', NULL, NULL, 908, 'PROP', 'GLB 오브젝트 glb-0007', NULL, NULL, NULL, 'ACTIVE'),
    (1018, 'CATALOG', NULL, NULL, 908, 'PROP', 'GLB 오브젝트 glb-0012', NULL, NULL, NULL, 'ACTIVE'),
    (1019, 'CATALOG', NULL, NULL, 908, 'PROP', 'GLB 오브젝트 glb-0013', NULL, NULL, NULL, 'ACTIVE'),
    (1020, 'CATALOG', NULL, NULL, 908, 'PROP', 'GLB 오브젝트 glb-0014', NULL, NULL, NULL, 'ACTIVE'),
    (1021, 'CATALOG', NULL, NULL, 908, 'PROP', 'GLB 오브젝트 glb-0015', NULL, NULL, NULL, 'ACTIVE'),
    (1022, 'CATALOG', NULL, NULL, 908, 'PROP', 'GLB 오브젝트 glb-0017', NULL, NULL, NULL, 'ACTIVE'),
    (1023, 'CATALOG', NULL, NULL, 908, 'PROP', 'GLB 오브젝트 glb-0021', NULL, NULL, NULL, 'ACTIVE');


-- =====================================================================
-- 5. monitor 서브타입 (2행) — product.ts MONITOR_27 / MONITOR_34_CURVED 그대로
-- =====================================================================

INSERT INTO monitor (product_id, diagonal_inch, aspect_width, aspect_height, bezel_mm, panel_thickness_mm, panel_shape, curvature_radius_mm, stand_depth_mm, is_stand_detachable, is_pivot_supported, swivel_max_deg, height_adjust_range_mm, tilt_min_deg, tilt_max_deg, weight_g, ports) VALUES
    (1000, 27.0, 16, 9, 8, NULL, 'FLAT',   NULL, 130, false, false, NULL, NULL, NULL, NULL, 4200, '["HDMI 2.0","DP 1.4","USB-C"]'::jsonb),
    (1001, 34.0, 43, 18, 9, NULL, 'CURVED', 1800, 230, false, false, NULL, NULL, NULL, NULL, 7100, '["HDMI 2.1","DP 1.4","USB-C"]'::jsonb);
-- is_stand_detachable·is_pivot_supported·swivel_max_deg·tilt_min/max_deg: 프론트 MonitorSpec에 없는
-- 컬럼 — placeholder(false/NULL). 오늘 호환성 판정은 프론트 로컬 계산(ADR-0004)이라 이 값을 읽지
-- 않는다 — 실제 저작 전까지의 임시값이다.


-- =====================================================================
-- 6. arm 서브타입 (1행) — product.ts monitor-arm-white(ArmSpec) + rig 5관절 → ARTICULATED
-- =====================================================================

INSERT INTO arm (product_id, arm_kind, arm_type, device_capacity, segment_count, pole_height_mm, reach_min_mm, reach_max_mm, height_min_mm, height_max_mm, is_clamp_mountable, is_grommet_mountable, is_wall_mountable, clamp_min_mm, clamp_max_mm, tilt_min_deg, tilt_max_deg, swivel_range_deg, pivot_range_deg, is_vesa_plate_detachable, has_cable_management, allowed_load_g) VALUES
    (1002, 'MONITOR', 'ARTICULATED', 1, 5, NULL, NULL, NULL, NULL, NULL, true, false, false, 10, 40, NULL, NULL, NULL, NULL, false, false, 5000);
-- device_capacity=1·segment_count=5(rig 관절 5개)·is_grommet_mountable/is_wall_mountable/
-- is_vesa_plate_detachable/has_cable_management=false: 프론트 ArmSpec에 없는 컬럼 — placeholder.
-- clamp_min_mm/clamp_max_mm·allowed_load_g·is_clamp_mountable은 실측값(ArmSpec 그대로).


-- =====================================================================
-- 7. light 서브타입 (2행) — product.ts lamp-warm(고정, min==max) / lamp-task(가변)
-- =====================================================================

INSERT INTO light (product_id, width_mm, depth_mm, height_mm, is_color_temperature_adjustable, color_temperature_min_k, color_temperature_max_k, is_brightness_adjustable, luminous_flux_min_lm, luminous_flux_max_lm, distribution, reach_mm) VALUES
    (1003, 160, 160, 430, false, 2700, 2700, false, 400, 400, 'SPOT',  1200),
    (1004, 150, 150, 460, true,  3000, 5700, true,  200, 560, 'FLOOD', 1500);
-- 이 6컬럼은 카탈로그 표기 마커일 뿐 렌더 정본이 아니다(product_emitter가 정본, product/CLAUDE.md) —
-- 두 램프 다 product_emitter 행이 없다(procedural SpotLight라 emitter 테이블 대상이 아니다).


-- =====================================================================
-- 8. prop 서브타입 (19행 = 이름 있는 소품 7 + GLB 라이브러리 12)
--    GLB 라이브러리 12개의 mm은 실측이 아니다 — buildGlbLibrarySpecs()가 런타임에 실제 GLB를
--    로드해 바운딩박스로 계산하고 코드에 사전 계산값이 없다(glbLibrarySpecs.ts). 판정 미사용
--    placeholder(200x200x200)이고, 실측 대체는 별도 작업(GLTFLoader+Box3 측정 스크립트 필요).
-- =====================================================================

INSERT INTO prop (product_id, width_mm, depth_mm, height_mm, weight_g, is_stackable, mount_surface) VALUES
    (1005, 360, 140, 38,  NULL, false, 'TOP'),  -- keyboard-tkl
    (1006, 120, 160, 200, NULL, false, 'TOP'),  -- speaker-book
    (1007, 72,  72,  255, NULL, false, 'TOP'),  -- bottle-steel
    (1008, 90,  90,  98,  NULL, false, 'TOP'),  -- mug-ceramic
    (1009, 130, 130, 270, NULL, false, 'TOP'),  -- plant-pot
    (1010, 290, 80,  220, NULL, false, 'TOP'),  -- decor-waves
    (1011, 900, 400, 4,   NULL, true,  'TOP'),  -- deskmat-900 (frontend stackable:true)
    (1012, 200, 200, 200, NULL, false, 'TOP'),  -- glb-0001 (placeholder mm)
    (1013, 200, 200, 200, NULL, false, 'TOP'),  -- glb-0002 (placeholder mm)
    (1014, 200, 200, 200, NULL, false, 'TOP'),  -- glb-0003 (placeholder mm)
    (1015, 200, 200, 200, NULL, false, 'TOP'),  -- glb-0004 (placeholder mm)
    (1016, 200, 200, 200, NULL, false, 'TOP'),  -- glb-0005 (placeholder mm)
    (1017, 200, 200, 200, NULL, false, 'TOP'),  -- glb-0007 (placeholder mm)
    (1018, 200, 200, 200, NULL, false, 'TOP'),  -- glb-0012 (placeholder mm)
    (1019, 200, 200, 200, NULL, false, 'TOP'),  -- glb-0013 (placeholder mm)
    (1020, 200, 200, 200, NULL, false, 'TOP'),  -- glb-0014 (placeholder mm)
    (1021, 200, 200, 200, NULL, false, 'TOP'),  -- glb-0015 (placeholder mm)
    (1022, 200, 200, 200, NULL, false, 'TOP'),  -- glb-0017 (placeholder mm)
    (1023, 200, 200, 200, NULL, false, 'TOP');  -- glb-0021 (placeholder mm)
-- mount_surface='TOP' 전원: 엔진이 아직 상판 배치만 모델링한다(REQ-SIM-24 이전, simulator/CLAUDE.md) —
-- 지금 유일하게 정당화되는 값이다. weight_g: 프론트에 소스 없음(NULL, 컬럼 자체가 nullable).


-- =====================================================================
-- 9. product_vesa 조인 (4행) — 모니터 2종·암 1종의 VESA 호환 세트
-- =====================================================================

INSERT INTO product_vesa (id, product_id, vesa_spec_id) VALUES
    (900, 1000, 951),  -- monitor-27           → 100x100
    (901, 1001, 951),  -- monitor-34-curved    → 100x100
    (902, 1002, 950),  -- monitor-arm-white    → 75x75
    (903, 1002, 951);  -- monitor-arm-white    → 100x100


-- =====================================================================
-- 10. product_emitter (2행) — keyboard-tkl·decor-waves의 장식 발광(emitters.ts EmitterManifest)
--     둘 다 PointLight(emitters.ts 주석) → shape=POINT, distribution=NULL(POINT엔 원뿔이 없다)
-- =====================================================================

INSERT INTO product_emitter (product_id, shape, distribution, lumens, radius_mm, recolorable, default_color, point_x_mm, point_y_mm, point_z_mm) VALUES
    (1005, 'POINT', NULL, 30, 400, true,  '#6060E0', NULL, NULL, NULL),  -- keyboard-tkl
    (1010, 'POINT', NULL, 45, 450, false, '#3F6EC2', NULL, NULL, NULL);  -- decor-waves (고정색, 프론트 recolorable:false)


-- =====================================================================
-- 11. 시퀀스 방어적 전진 — 이후 앱(nextval 경로)이 위 명시적 id와 절대 충돌하지 않도록
--     "이미 있는 최댓값" 기준으로 미는 것이라 이 파일을 어느 상태의 DB에 돌려도 안전하다.
-- =====================================================================

SELECT setval('category_id_seq',     (SELECT MAX(id) FROM category)     + 50, true);
SELECT setval('brand_id_seq',        (SELECT MAX(id) FROM brand)        + 50, true);
SELECT setval('vesa_spec_id_seq',    (SELECT MAX(id) FROM vesa_spec)    + 50, true);
SELECT setval('product_vesa_id_seq', (SELECT MAX(id) FROM product_vesa) + 50, true);
SELECT setval('product_id_seq',      (SELECT MAX(id) FROM product)      + 50, true);
