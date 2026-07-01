import { text } from "../i18n";
import type { Language, ResourceKey } from "../types";
import { GlyphIcon } from "./GlyphIcon";

const resources: ResourceKey[] = ["faith", "people", "military", "wealth"];

type HudProps = {
  meters: Record<ResourceKey, number>;
  language: Language;
  effects?: Partial<Record<ResourceKey, number>>;
};

export function Hud({ meters, language, effects = {} }: HudProps) {
  const resourceLabels = text[language].resourceLabels;

  return (
    <header className="hud" aria-label={text[language].resources}>
      <div className="hud-title">simulation-test</div>
      <div className="meter-row">
        {resources.map((resource) => {
          const delta = effects[resource] ?? 0;
          return (
            <div className="meter" key={resource} aria-label={`${resourceLabels[resource]} ${meters[resource]}`}>
              <GlyphIcon resource={resource} />
              <span className="meter-value">{meters[resource]}</span>
              <span className={`meter-delta ${delta > 0 ? "gain" : delta < 0 ? "loss" : "neutral"}`}>
                {delta > 0 ? `+${delta}` : delta < 0 ? delta : "0"}
              </span>
            </div>
          );
        })}
      </div>
    </header>
  );
}
