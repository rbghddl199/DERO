// 내 데스크테리어 목록 — 그리드 첫 칸(좌측 상단)은 항상 새 데스크테리어 추가 카드.
// 선택 삭제 모드(isSelecting)에서는 추가 카드를 숨기고 각 카드를 선택 토글로 바꾼다.
import type { DeskProject } from '@/types/craft';
import AddDeskProjectCard from './AddDeskProjectCard';
import DeskProjectCard from './DeskProjectCard';

type Props = {
  projects: DeskProject[];
  isSelecting?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
};

const DeskProjectList = ({ projects, isSelecting = false, selectedIds, onToggleSelect }: Props) => {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {!isSelecting && <AddDeskProjectCard />}
      {projects.map((project) => (
        <DeskProjectCard
          key={project.id}
          project={project}
          isSelecting={isSelecting}
          isSelected={selectedIds?.has(project.id) ?? false}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  );
};

export default DeskProjectList;
