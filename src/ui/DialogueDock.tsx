import { useEffect, useId, useRef, useState } from "react";
import type { GameSession } from "./gameSession";
import { dialogueStatusLabel, getConversationTurns, groupConversations, type ConversationTurn } from "./dialoguePresentation";
import { Modal } from "./overlays";
import styles from "./DialogueDock.module.css";
import { getHeadMessageDeadlines } from "./headMessages";

function Exchange({ turn }: { turn: ConversationTurn }) {
  return <div className={styles.exchange}>
    <p><span className={styles.voice}>我的角色</span><span>{turn.question}</span></p>
    <p data-reply><span className={styles.voice}>NPC {turn.npcId}</span><span>{turn.reply ?? (turn.status === "pending" ? "正在听取请求，等待答复…" : "未获得有效答复，可稍后重试。")}</span></p>
  </div>;
}

export function ConversationHistory({ turns }: { turns: ConversationTurn[] }) {
  return <div className={styles.history}>
    {groupConversations(turns).map(group => <section key={group.npcId} aria-label={`与 ${group.npcId} 的交谈`}>
      <h3>{group.label}<small>{group.turns.length} 轮交谈</small></h3>
      {group.turns.map(turn => <article key={turn.id}>
        <div className={styles.round}><strong>{`第 ${turn.round} 轮`}</strong><span>{turn.t.toFixed(1)}s · {dialogueStatusLabel[turn.status]}</span></div>
        <Exchange turn={turn} />
      </article>)}
    </section>)}
  </div>;
}

/** One current exchange; the full record stays grouped by person and round. */
export function DialogueDock({ session }: { session: GameSession }) {
  const turns = getConversationTurns(session), current = turns.at(-1);
  const key = `${session.generation}:${current?.id}:${current?.status}`;
  const speechRevision = session.presentation.current.speech.map(line => `${line.speakerId}:${line.t}:${line.text}`).join("|");
  const [idleKey, setIdleKey] = useState("");
  const [manual, setManual] = useState<{ key: string; collapsed: boolean } | null>(null);
  const dock = useRef<HTMLElement>(null);
  const bodyId = useId();
  const expanded = manual?.key === key ? !manual.collapsed : idleKey !== key;

  // Demand-rendered 3D and a frozen world still need one refresh at each visual deadline.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const now = performance.now();
      const deadline = getHeadMessageDeadlines(session, now)[0];
      if (deadline !== undefined) timer = setTimeout(() => { session.notify(); schedule(); }, Math.max(16, deadline - now + 16));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [session, session.generation, key, speechRevision]);
  useEffect(() => {
    if (!current || current.status === "pending") return;
    const timer = setTimeout(() => {
      if (dock.current?.contains(document.activeElement) || dock.current?.matches(":hover")) return;
      setIdleKey(key);
    }, 8000);
    return () => clearTimeout(timer);
  }, [key, current?.status]);

  if (!current) return null;
  return <section ref={dock} className={styles.dock} data-dialogue-dock data-scene-obstacle data-expanded={expanded} aria-label="当前对话">
    <div className={styles.heading}>
      <button className={styles.toggle} aria-expanded={expanded} aria-controls={bodyId} onClick={() => { setManual({ key, collapsed: expanded }); session.notify(); }}>
        <span className={styles.symbol} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 5h14v10H9l-4 4V5Z"/><path d="M8 9h8M8 12h5"/></svg></span>
        <span className={styles.identity}><strong>{current.label}</strong><small>{`第 ${current.round} 轮`}<span className={styles.status} data-status={current.status}>{dialogueStatusLabel[current.status]}</span></small></span>
        <span className={styles.chevron} aria-hidden="true">{expanded ? "⌄" : "⌃"}</span>
      </button>
      <Modal title="对话记录" description="按交谈对象分组，每一轮保留角色原话与实际答复。" wide trigger={<button className={styles.historyButton} aria-label={`对话记录，共 ${turns.length} 轮`}>记录 <span>{turns.length}</span></button>}>
        <ConversationHistory turns={turns} />
      </Modal>
    </div>
    <div id={bodyId} className={styles.body} hidden={!expanded}>
      <div aria-live="polite" aria-atomic="true"><Exchange turn={current} /></div>
    </div>
  </section>;
}
