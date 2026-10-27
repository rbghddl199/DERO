'use client';
// 상단 흰 네비바 — 화면 맨 위(천장)에 딱 붙는 풀폭 바. 좌측엔 DERO 로고(2026-07-27
// 추가 — 전역 TopNavbar.tsx와 같은 자산. 클릭하면 나가기 확인 흐름을 탄다), 우측엔 마지막 저장 시각
// + 조명·외곽선·편집 잠금·충돌 무시 on/off 토글(2026-07-27, 좌측 레일에서 이동 — 항상 눌리는
// 빈도가 높아 레일 카테고리를 열지 않고 바로 접근하게. 편집 잠금은 같은 날 신규.
// 저장 시각은 같은 날 나가기 옆에서 조명 토글 왼쪽으로 재배치) + 확대/축소 버튼 쌍
// (신규, OrbitControls.dollyIn/Out 직결) + 나가기 버튼(2026-07-27, 떠 있는 버튼
// 두 개에서 풀폭 바로 개정). 실행 취소/다시 실행·저장은 좌측 레일
// (EditorSidebar)로 합쳐졌다(저장은 같은 날 추가 개정).

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useHistoryBackGuard } from '@/hooks/useHistoryBackGuard';
import { useSimulatorStore } from '@/store/simulatorStore';
import {
  detectBrowserKind,
  detectGpuAcceleration,
  type BrowserKind,
  type GpuAccelerationStatus,
} from '@/utils/hardwareAcceleration';
import SidebarIcon from './SidebarIcon';
import ExitConfirmDialog from './ExitConfirmDialog';
import HardwareAccelDialog from './HardwareAccelDialog';
import DeroLogo from '@/assets/dero_logo.svg';
import {
  shouldConfirmSimulatorExit,
  SIMULATOR_EXIT_DESTINATION_URL,
  SIMULATOR_EXIT_REQUEST_EVENT,
  type SimulatorExitRequestDetail,
} from '@/utils/simulatorExit';

const formatSavedAt = (epochMs: number): string =>
  new Date(epochMs).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

const EditorTopBar = () => {
  const router = useRouter();
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  // 확인 다이얼로그의 '저장하지않음/나가기' 버튼이 실행할 액션 — 트리거마다 다르다(로고·나가기
  // 버튼·외부 이동은 정해진 href로 이동, 브라우저 뒤로가기는 히스토리 sentinel을 소비하는
  // leave()). '취소'는 뒤로가기 트리거일 때만 특별한 되돌리기(stay())가 필요하다.
  const onExitConfirmedRef = useRef<() => void>(() => {
    window.location.href = SIMULATOR_EXIT_DESTINATION_URL;
  });
  const onExitCancelledRef = useRef<(() => void) | null>(null);
  const sim = useSimulatorStore((s) => s.sim);
  // placedVersion 자체는 화면에 안 쓰지만 구독해야 배치 변경마다 sim.placed()를 다시 읽는다.
  useSimulatorStore((s) => s.placedVersion);
  const placedCount = sim ? sim.placed().length : 0;
  const projectTitle = useSimulatorStore((s) => s.projectTitle);
  const setProjectTitle = useSimulatorStore((s) => s.setProjectTitle);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(projectTitle);
  const lastSavedAt = useSimulatorStore((s) => s.lastSavedAt);
  const hasUnsavedChanges = useSimulatorStore((s) => s.changeVersion !== s.savedChangeVersion);
  const roomLightOn = useSimulatorStore((s) => s.roomLightOn);
  const setRoomLight = useSimulatorStore((s) => s.setRoomLight);
  const contourOn = useSimulatorStore((s) => s.contourOn);
  const setContourLines = useSimulatorStore((s) => s.setContourLines);
  const editLocked = useSimulatorStore((s) => s.editLocked);
  const toggleEditLock = useSimulatorStore((s) => s.toggleEditLock);
  const collisionIgnored = useSimulatorStore((s) => s.collisionIgnored);
  const setCollisionIgnore = useSimulatorStore((s) => s.setCollisionIgnore);
  const zoomIn = useSimulatorStore((s) => s.zoomIn);
  const zoomOut = useSimulatorStore((s) => s.zoomOut);

  // 하드웨어(그래픽) 가속 표시등 — 감지는 WebGL 프로브라 브라우저 API가 필요해 마운트 후
  // 이펙트에서 한 번만 한다(가속 토글은 브라우저 재시작이 필요하므로 페이지 생존 중엔 불변).
  // setTimeout으로 감싸는 이유: 이펙트 본문에서 곧장 setState하면 React Compiler 린트
  // (react-hooks/set-state-in-effect)가 막는다 — CollectionEditForm 등과 같은 우회.
  const [accelStatus, setAccelStatus] = useState<GpuAccelerationStatus | null>(null);
  const [browserKind, setBrowserKind] = useState<BrowserKind>('other');
  const [hwaccelDialogOpen, setHwaccelDialogOpen] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setAccelStatus(detectGpuAcceleration());
      setBrowserKind(detectBrowserKind());
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // 고정 목적지(SIMULATOR_EXIT_DESTINATION_URL)는 사용자가 지정한 절대 URL이라 라우터가 아니라
  // 하드 이동으로 보낸다 — 로컬 개발 환경(다른 origin)에서도 항상 이 URL로 가야 하고,
  // next/navigation의 router.push는 내부 라우팅용이라 외부 origin 문자열을 신뢰할 수 없다.
  // 외부에서 지정한 href(예: 좋아요 목록 보기 토스트)는 내부 경로이므로 그대로 router.push.
  const navigateTo = (href: string): void => {
    if (href === SIMULATOR_EXIT_DESTINATION_URL) {
      window.location.href = href;
      return;
    }
    router.push(href);
  };

  const requestExit = (href = SIMULATOR_EXIT_DESTINATION_URL): void => {
    onExitConfirmedRef.current = () => navigateTo(href);
    onExitCancelledRef.current = null;
    if (shouldConfirmSimulatorExit(hasUnsavedChanges)) {
      setExitConfirmOpen(true);
      return;
    }
    navigateTo(href);
  };

  useEffect(() => {
    const handleExitRequest = (event: Event): void => {
      const { href } = (event as CustomEvent<SimulatorExitRequestDetail>).detail;
      requestExit(href);
    };
    window.addEventListener(SIMULATOR_EXIT_REQUEST_EVENT, handleExitRequest);
    return () => window.removeEventListener(SIMULATOR_EXIT_REQUEST_EVENT, handleExitRequest);
  });

  // 브라우저 뒤로가기도 로고·나가기 버튼과 같은 규칙을 따른다: 저장 안 한 변경 사항이 있을
  // 때만 확인창을 띄운다(2026-08-06 재정리 — 이전엔 로고/외부 이동은 변경 여부와 무관하게
  // 항상 확인했는데, "이 외의 경우엔 문구 없이 그냥 나가게" 요청으로 세 트리거 모두
  // hasUnsavedChanges 하나로 통일했다). 가드 자체도 변경 사항이 있을 때만 켜진다
  // (useHistoryBackGuard 상단 주석: Next 라우터가 우리보다 먼저 popstate를 처리해버려
  // 그냥 듣기만 해서는 확인이 아예 안 뜨는 문제가 있었다). onLeave로 실제 이전 히스토리
  // 엔트리 대신 항상 고정 목적지로 보낸다 — 뒤로가기 이전에 진짜 어디에 있었든 상관없다.
  useHistoryBackGuard(
    hasUnsavedChanges,
    (leave, stay) => {
      onExitConfirmedRef.current = leave;
      onExitCancelledRef.current = stay;
      setExitConfirmOpen(true);
    },
    () => {
      window.location.href = SIMULATOR_EXIT_DESTINATION_URL;
    },
  );

  const handleExitConfirm = (): void => {
    setExitConfirmOpen(false);
    onExitConfirmedRef.current();
  };
  const handleExitCancel = (): void => {
    setExitConfirmOpen(false);
    onExitCancelledRef.current?.();
  };

  return (
    <div className="editor-topbar hud" data-testid="editor-topbar">
      <div className="editor-topbar-brand">
        <button
          type="button"
          className="editor-topbar-logo-button"
          aria-label="작업실 나가기"
          data-testid="exit-simulator-logo"
          onClick={() => requestExit()}
        >
          <Image src={DeroLogo} alt="DERO" className="editor-topbar-logo" priority />
        </button>

        {isEditingTitle ? (
          <input
            type="text"
            className="editor-topbar-title-input"
            value={titleDraft}
            autoFocus
            data-testid="project-title-input"
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              setProjectTitle(titleDraft);
              setIsEditingTitle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setTitleDraft(projectTitle);
                setIsEditingTitle(false);
              }
            }}
          />
        ) : (
          <span className="editor-topbar-title" data-testid="project-title">
            {projectTitle}
          </span>
        )}

        <button
          type="button"
          className="editor-topbar-title-edit"
          aria-label="제목 수정"
          title="제목 수정"
          data-testid="edit-project-title"
          onClick={() => {
            setTitleDraft(projectTitle);
            setIsEditingTitle(true);
          }}
        >
          <SidebarIcon name="edit" width={14} height={14} />
        </button>

        {lastSavedAt !== null && (
          <span className="editor-saved-at" data-testid="last-saved-at">
            {formatSavedAt(lastSavedAt)} 저장됨
          </span>
        )}
      </div>

      <div className="editor-topbar-actions">
        <span className="count-tag" data-testid="placed-item-count">
          총 {placedCount}개
        </span>
        {/* 진짜 토글이 아니라 표시등 + 안내 진입점 — 브라우저 보안 정책상 페이지가 가속 설정을
            직접 못 바꿔서, 클릭하면 브라우저별 설정 경로 안내 모달을 연다(HardwareAccelDialog). */}
        <button
          type="button"
          className={accelStatus?.accelerated ? 'topbar-toggle on' : 'topbar-toggle'}
          data-testid="hardware-accel"
          title="하드웨어 가속 설정 안내"
          aria-haspopup="dialog"
          onClick={() => setHwaccelDialogOpen(true)}
        >
          <SidebarIcon name="gpu" width={18} height={18} />
          <span className="topbar-toggle-text">
            하드웨어 가속
            <span className="topbar-toggle-state">
              {accelStatus === null ? '…' : accelStatus.accelerated ? 'ON' : 'OFF'}
            </span>
          </span>
        </button>
        <button
          type="button"
          className={roomLightOn ? 'topbar-toggle on' : 'topbar-toggle'}
          data-testid="room-light"
          onClick={() => setRoomLight(!roomLightOn)}
        >
          <SidebarIcon name="light" width={18} height={18} />
          <span className="topbar-toggle-text">
            조명
            <span className="topbar-toggle-state">{roomLightOn ? 'ON' : 'OFF'}</span>
          </span>
        </button>

        <button
          type="button"
          className={contourOn ? 'topbar-toggle on' : 'topbar-toggle'}
          data-testid="contour-lines"
          onClick={() => setContourLines(!contourOn)}
        >
          <SidebarIcon name="contour" width={18} height={18} />
          <span className="topbar-toggle-text">
            외곽선
            <span className="topbar-toggle-state">{contourOn ? 'ON' : 'OFF'}</span>
          </span>
        </button>

        <button
          type="button"
          className={editLocked ? 'topbar-toggle on' : 'topbar-toggle'}
          data-testid="edit-lock"
          onClick={toggleEditLock}
        >
          <SidebarIcon name="lock" width={18} height={18} />
          <span className="topbar-toggle-text">
            편집 잠금
            <span className="topbar-toggle-state">{editLocked ? 'ON' : 'OFF'}</span>
          </span>
        </button>

        <button
          type="button"
          className={collisionIgnored ? 'topbar-toggle on' : 'topbar-toggle'}
          data-testid="collision-ignore"
          onClick={() => setCollisionIgnore(!collisionIgnored)}
        >
          <SidebarIcon name="collision" width={18} height={18} />
          <span className="topbar-toggle-text">
            충돌 무시
            <span className="topbar-toggle-state">{collisionIgnored ? 'ON' : 'OFF'}</span>
          </span>
        </button>

        <div className="topbar-zoom-group">
          <button
            type="button"
            className="topbar-icon-btn"
            data-testid="zoom-out"
            aria-label="축소"
            title="축소"
            onClick={zoomOut}
          >
            <SidebarIcon name="zoom-out" width={17} height={17} />
          </button>
          <button
            type="button"
            className="topbar-icon-btn"
            data-testid="zoom-in"
            aria-label="확대"
            title="확대"
            onClick={zoomIn}
          >
            <SidebarIcon name="zoom-in" width={17} height={17} />
          </button>
        </div>

        <button
          type="button"
          className="btn btn-secondary editor-action-btn"
          data-testid="exit-simulator"
          onClick={() => requestExit()}
        >
          <SidebarIcon name="exit" />
          나가기
        </button>
      </div>

      {exitConfirmOpen && (
        <ExitConfirmDialog
          hasUnsavedChanges={hasUnsavedChanges}
          onConfirm={handleExitConfirm}
          onCancel={handleExitCancel}
        />
      )}
      {hwaccelDialogOpen && (
        <HardwareAccelDialog
          status={accelStatus}
          browserKind={browserKind}
          onClose={() => setHwaccelDialogOpen(false)}
        />
      )}
    </div>
  );
};

export default EditorTopBar;
