import { useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { GameReport } from "../shared/types";
import type { Engine } from "../sim/engine";
import { DecisionLog } from "./DecisionLog";
import { EventTimeline, ReportSummary } from "./ReportView";
import type { ReviewSession } from "./reviewSession";
import { TrajectoryReplayView } from "./TrajectoryReplay";
import "./JourneyReview.css";

export interface JourneyReviewProps {
  report: GameReport;
  engine: Engine;
  review: ReviewSession | null;
  open: boolean;
  onClose: () => void;
  previous?: boolean;
  onEdit?: (guidance?: string) => void;
}

/** 沿用 PR #51 的单列复盘；原局控制器保留策略、草稿和导出数据。 */
export function JourneyReview({ report, engine, review, open, onClose, previous = false, onEdit }: JourneyReviewProps) {
  const heading = useRef<HTMLHeadingElement>(null);

  return <Dialog.Root open={open} onOpenChange={value => { if (!value) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="journey-review-backdrop" />
      <Dialog.Content className="journey-review" onOpenAutoFocus={event => { event.preventDefault(); heading.current?.focus(); }}>
        <header className="review-topbar">
          <div>
            <Dialog.Title ref={heading} tabIndex={-1}>{previous ? "上一局报告" : "行程复盘"}</Dialog.Title>
            <Dialog.Description>{report.journey?.sceneName ?? "地铁末班车"} · {report.journey?.characterName ?? "本次行程"}{previous && " · 刷新后清除"}</Dialog.Description>
          </div>
          <Dialog.Close asChild><button>{previous ? "返回当前旅程" : "返回场景"}</button></Dialog.Close>
        </header>
        <ReportSummary report={report} reviewSession={review} onAdopt={previous ? undefined : onEdit} readOnly={previous} active={open}
          replay={<><p className="muted">回看角色轨迹；NPC 和设施显示终局状态。</p><TrajectoryReplayView report={report} engine={engine} /></>}
          records={<><DecisionLog decisions={report.decisions} /><EventTimeline report={report} /></>} />
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
