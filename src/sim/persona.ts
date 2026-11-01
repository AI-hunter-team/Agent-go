import type { PassengerKind, Persona } from "../shared/types";
import { LOOKS, PERSONALITY_PROFILES } from "./content/personas";
import type { Rng } from "./rng";

const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Call using a retained subsystem RNG, never by re-forking per passenger. */
export function generatePersona(rng: Rng, kind: PassengerKind, legacyIrritable?: boolean): Persona {
  const profile = rng.pick(PERSONALITY_PROFILES);
  const sample = (n: number) => clamp(n + rng.range(-.08, .08));
  const temperSample = sample(profile.traits.temper);
  const temper = legacyIrritable === undefined ? temperSample : legacyIrritable ? Math.max(.61, temperSample) : Math.min(.6, temperSample);
  const traits = { courage: sample(profile.traits.courage), vanity: sample(profile.traits.vanity), temper, fairness: sample(profile.traits.fairness), meddling: sample(profile.traits.meddling) };
  return {
    look: {
      build: rng.pick(LOOKS.build), outfit: rng.pick(LOOKS.outfit), carrying: kind === "luggage" ? ["大件行李"] : [],
      manner: kind === "hurried" ? "步伐很快" : kind === "elderly" ? "步幅缓慢" : rng.pick(LOOKS.manner), voice: rng.pick(LOOKS.voice),
    },
    traits,
    situation: { hurry: clamp(sample(profile.hurry) + (kind === "hurried" ? .4 : kind === "elderly" ? -.15 : 0)),
      fatigue: clamp(sample(profile.fatigue) + (kind === "elderly" || kind === "luggage" ? .15 : 0)), companionId: null, luggage: kind === "luggage" },
  };
}

export function temperamentDescription(persona: Persona): string {
  const t = persona.traits;
  return [t.temper > 0.6 ? "急躁" : "语气平和", t.fairness > 0.5 ? "重视排队公平" : "愿意灵活商量",
    t.courage > 0.6 ? "遇事敢于表达" : "谨慎避免冲突", persona.situation.hurry > 0.6 ? "自己也赶时间" : "目前不太着急"].join("，");
}
