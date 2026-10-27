'use client';
// 조명 등록 도구 우 패널 하단 — lampShade 차단각 게이트 수치·경고 목록·GLB 노드 이름 목록

import { useState } from 'react';
import {
  reviewLightAsset,
  SHADE_MESH_NAME,
  type AuthoringIssue,
  type IssueLevel,
} from '@/three/core/lightAuthoring';
import { beamHalfAngleRad } from '@/three/scene/lighting';
import { useLightAuthorStore } from '@/store/lightAuthorStore';

const LEVEL_CLASS: Record<IssueLevel, string> = {
  error: 'bg-danger-50 text-danger-700',
  warn: 'bg-warning-50 text-warning-700',
  info: 'bg-neutral-100 text-neutral-600',
};

const LEVEL_LABEL: Record<IssueLevel, string> = {
  error: '경고',
  warn: '주의',
  info: '확인',
};

const deg = (rad: number): string => `${((rad * 180) / Math.PI).toFixed(1)}°`;
const mm = (m: number): string => `${(m * 1000).toFixed(1)} mm`;

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-2 py-0.5">
    <span className="text-neutral-500">{label}</span>
    <span className="font-mono">{value}</span>
  </div>
);

const LightShadePanel = () => {
  const analysis = useLightAuthorStore((s) => s.analysis);
  const distribution = useLightAuthorStore((s) => s.distribution);
  const nodeNames = useLightAuthorStore((s) => s.nodeNames);
  const [namesOpen, setNamesOpen] = useState(false);

  const beam = beamHalfAngleRad(distribution);
  // 파생 배열은 셀렉터가 아니라 본문에서 만든다 — zustand v5 셀렉터가 새 참조를 돌려주면
  // useSyncExternalStore가 무한 리렌더한다(frontend/CLAUDE.md).
  const issues: AuthoringIssue[] = analysis ? reviewLightAsset(analysis, beam) : [];
  const gate = analysis?.gate ?? null;

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-neutral-300 p-3 text-[11px]">
        <h2 className="mb-1 text-xs font-semibold">
          <code>{SHADE_MESH_NAME}</code> 차단각 게이트
        </h2>

        {!gate && (
          <p className="text-neutral-500">
            {analysis ? '갓 표본이 없어 차단각을 계산하지 않았습니다' : 'GLB를 로드하세요'}
          </p>
        )}

        {gate && (
          <>
            <Row label="갓 메쉬" value={`${gate.meshCount}개`} />
            <Row label="표본" value={`점 ${gate.sampledPoints} · 방위 ${gate.sampledBins}빈`} />
            <Row label="갓 아랫테 반경 rBot" value={mm(gate.rBotM)} />
            <Row label="광원→아랫테 깊이 H" value={mm(gate.depthM)} />
            <Row label="atan(rBot/H) (기울기 무시)" value={deg(gate.blockAngleRad)} />
            <Row
              label="차단 시작각 (방위별)"
              value={`${deg(gate.minBlockAngleRad)} ~ ${deg(gate.maxBlockAngleRad)}`}
            />
            <Row label="빔 반각" value={deg(beam)} />
          </>
        )}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto p-2 text-[11px]">
        {issues.map((issue) => (
          <li key={issue.message} className={`mb-1 rounded px-2 py-1 ${LEVEL_CLASS[issue.level]}`}>
            <b className="mr-1">{LEVEL_LABEL[issue.level]}</b>
            {issue.message}
          </li>
        ))}
        {analysis && (
          <li className="mt-2 text-neutral-500">
            어떤 항목도 등록을 막지 않는다 — 얕은 접시형 갓·오픈 셰이드는 실물에 있다 (228 결정 ③).
          </li>
        )}
      </ul>

      <div className="border-t border-neutral-300 p-2 text-[11px]">
        <button
          type="button"
          onClick={() => setNamesOpen((v) => !v)}
          className="cursor-pointer text-neutral-600"
        >
          GLB 노드 이름 {nodeNames.length}개 {namesOpen ? '▴' : '▾'}
        </button>
        {namesOpen && (
          <ul className="mt-1 max-h-40 overflow-y-auto font-mono text-neutral-500">
            {nodeNames.map((name, i) => (
              <li key={`${name}-${i}`}>{name}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default LightShadePanel;
