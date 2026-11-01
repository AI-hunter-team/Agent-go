import { useState } from "react";
import type { Engine } from "../sim/engine";
import { PERSONALITY_PROFILES } from "../sim/content/personas";
import type { Persona } from "../shared/types";
import type { LabNpcSettings, NpcTuning } from "./scenarios";

const traits: [keyof Persona["traits"], string, string][] = [
  ["courage", "胆量", "谨慎退让 → 大胆反抗"], ["vanity", "虚荣心", "不在意面子 → 很在意恭维与面子"],
  ["temper", "脾气", "温和 → 易怒"], ["fairness", "公平意识", "灵活商量 → 坚持规则"], ["meddling", "介入倾向", "少管闲事 → 主动干预或报告"],
];

export function NpcControls({ engine, settings, onChange, disabled }: { engine: Engine; settings: LabNpcSettings; onChange: (value: LabNpcSettings) => void; disabled: boolean }) {
  const [selected, select] = useState("*");
  const people = [...engine.world.persons.values()].filter(p => !p.isPlayer && p.persona);
  const target = selected === "*" || people.some(p => p.id === selected) ? selected : "*";
  const persona = (target === "*" ? people[0] : people.find(p => p.id === target))?.persona;
  if (!persona) return <details><summary>乘客性格参数</summary><p className="muted">本场景没有乘客；保安使用独立的巡逻与警戒规则。</p></details>;
  const own = settings[target] ?? {};
  const combined = { traits: { ...persona.traits, ...settings["*"]?.traits, ...own.traits }, situation: { ...persona.situation, ...settings["*"]?.situation, ...own.situation } };
  const template = PERSONALITY_PROFILES.find(p => traits.every(([k]) => own.traits?.[k] === p.traits[k]) && own.situation?.hurry === p.hurry && own.situation?.fatigue === p.fatigue)?.id ?? (settings[target] ? "custom" : "default");
  const change = (group: "traits" | "situation", key: string, value: number) => {
    const patch: NpcTuning = { ...own, [group]: { ...own[group], [key]: value } };
    onChange({ ...settings, [target]: patch });
  };
  return <details className="npc-controls"><summary>乘客性格参数</summary><fieldset disabled={disabled}>
    <label>初始警戒<select value={own.initialAlert ?? settings["*"]?.initialAlert ?? "none"} onChange={e=>onChange({...settings,[target]:{...own,initialAlert:e.target.value as NpcTuning["initialAlert"]}})}><option value="none">无防备</option><option value="yellow">有所警惕</option><option value="red">高度戒备</option></select></label>
    <label>应用对象<select aria-label="性格应用对象" value={target} onChange={e => select(e.target.value)}><option value="*">所有乘客</option>{people.map(p => <option key={p.id} value={p.id}>{p.id} · {p.persona!.look.outfit}</option>)}</select></label>
    <label>性格模板<select aria-label="性格模板" value={template} onChange={e => {
      if (e.target.value === "default") { const next = { ...settings }; delete next[target]; onChange(next); return; }
      const p = PERSONALITY_PROFILES.find(p => p.id === e.target.value);
      if (p) onChange({ ...settings, [target]: { traits: { ...p.traits }, situation: { hurry: p.hurry, fatigue: p.fatigue } } });
    }}><option value="custom" disabled>自定义参数</option><option value="default">默认生成／继承所有乘客设置</option>{PERSONALITY_PROFILES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
    {traits.map(([key, label, hint]) => <label className="slider" key={key}><span>{label}<output>{combined.traits[key].toFixed(2)}</output></span><input aria-label={label} type="range" min="0" max="1" step="0.01" value={Number(combined.traits[key].toFixed(2))} onChange={e => change("traits", key, Number(e.target.value))} /><small>{hint}</small></label>)}
    {([ ["hurry", "赶时间程度", "不着急 → 非常着急"], ["fatigue", "疲惫程度", "精力充沛 → 疲惫"] ] as const).map(([key, label, hint]) => <label className="slider" key={key}><span>{label}<output>{combined.situation[key].toFixed(2)}</output></span><input aria-label={label} type="range" min="0" max="1" step="0.01" value={Number(combined.situation[key].toFixed(2))} onChange={e => change("situation", key, Number(e.target.value))} /><small>{hint}</small></label>)}
    <p className="muted">参数应用于下一次独立测试或恢复现场。默认生成已使用差异鲜明的性格组合；改变参数影响倾向，不保证同意或成功。选择单名乘客时，该设置优先于所有乘客设置。</p>
  </fieldset></details>;
}
