import type { PassengerKind, Persona } from "../shared/types";
import { LOOKS } from "./content/personas";
import type { Rng } from "./rng";

const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Call using a retained subsystem RNG, never by re-forking per passenger. */
export function generatePersona(rng: Rng, kind: PassengerKind, legacyIrritable?: boolean): Persona {
  const beta = () => (rng.next() + rng.next() + rng.next()) / 3;
  const temperSample = beta();
  const temper = legacyIrritable === undefined ? temperSample : legacyIrritable ? 0.61 + 0.39 * temperSample : 0.6 * temperSample;
  return {
    look: {
      build: rng.pick(LOOKS.build), outfit: rng.pick(LOOKS.outfit), carrying: kind === "luggage" ? ["大件行李"] : [],
      manner: kind === "hurried" ? "步伐很快" : kind === "elderly" ? "步幅缓慢" : rng.pick(LOOKS.manner), voice: rng.pick(LOOKS.voice),
    },
    traits: { courage: beta(), vanity: beta(), temper, fairness: beta(), meddling: beta() },
    situation: { hurry: clamp(beta() + (kind === "hurried" ? 0.3 : kind === "elderly" ? -0.15 : 0)),
      fatigue: clamp(beta() + (kind === "elderly" || kind === "luggage" ? 0.15 : 0)), companionId: null, luggage: kind === "luggage" },
  };
}

export function temperamentDescription(persona: Persona): string {
  const t = persona.traits;
  return [t.temper > 0.6 ? "急躁" : "语气平和", t.fairness > 0.5 ? "重视排队公平" : "愿意灵活商量",
    t.courage > 0.6 ? "遇事敢于表达" : "谨慎避免冲突", persona.situation.hurry > 0.6 ? "自己也赶时间" : "目前不太着急"].join("，");
}
