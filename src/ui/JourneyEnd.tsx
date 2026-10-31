import { forwardRef } from "react";
import type { GameReport } from "../shared/types";
import { BrandMark } from "./BrandMark";
import { journeyEndOutcome } from "./reportPresentation";
import styles from "./JourneyEnd.module.css";

interface Props {
  report: GameReport;
  hidden: boolean;
  onRetry: () => void;
  onReview: () => void;
  onEdit: () => void;
  onLobby: () => void;
}

/** End-of-run landing: the scene stays visible and every action is immediately available. */
export const JourneyEnd = forwardRef<HTMLButtonElement, Props>(function JourneyEnd({ report, hidden, onRetry, onReview, onEdit, onLobby }, ref) {
  const outcome = journeyEndOutcome(report);
  const success = report.status === "success";
  return <section className={styles.end} data-outcome={outcome.tone} aria-label="本局结果" hidden={hidden}>
    <div className={styles.navigation}><BrandMark className={styles.brand} /><button onClick={onLobby}>返回大厅</button></div>
    <div className={styles.result} role="status">
      {outcome.tone === "failed" && <span className={styles.failureLabel}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          {outcome.marker === "clock" ? <path d="M12 7v5l3 2" /> : <path d="m9 9 6 6m0-6-6 6" />}
        </svg>{outcome.label}
      </span>}
      <h1>{success ? "胜利！" : outcome.title}</h1>
      <p>{success ? <>成功登上地铁 · 用时 <strong>{(report.score ?? report.elapsed).toFixed(1)}</strong> 秒</> : outcome.detail}</p>
      {!success && <span className={styles.elapsed}>行程用时 <strong>{report.elapsed.toFixed(1)}</strong> 秒</span>}
    </div>
    {success && <div className={styles.confetti} aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ left: `${5 + i * 6}%`, animationDelay: `${(i % 5) * 0.12}s`, rotate: `${i * 37}deg` }} />)}</div>}
    <div className={styles.actions} aria-label="本局结束操作">
      <div className={styles.buttons}><button className="primary" onClick={onRetry}>再来一局</button><button ref={ref} aria-expanded={false} onClick={onReview}>查看复盘</button></div>
      <button className={styles.edit} onClick={onEdit}>修改思路</button>
    </div>
  </section>;
});
