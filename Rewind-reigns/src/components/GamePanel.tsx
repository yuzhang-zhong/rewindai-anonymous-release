import { text } from "../i18n";
import type { Analytics, GameState, Language, ResourceKey } from "../types";
import { DecisionCard } from "./DecisionCard";
import { Hud } from "./Hud";
import { LanguageSwitch } from "./LanguageSwitch";

type GamePanelProps = {
  state: GameState;
  pending: boolean;
  analytics: Analytics | null;
  language: Language;
  onChoose: (direction: "left" | "right" | "up" | "down") => void;
  onRestart: () => void;
  onLanguageChange: (language: Language) => void;
  onOpenAdvisor: () => void;
  advisorLabel?: string;
  onOpenRecords: () => void;
};

const resources: ResourceKey[] = ["faith", "people", "military", "wealth"];

function effectsMatchDisplayedMeters(state: GameState) {
  const latest = state.history[state.history.length - 1];
  if (!latest) {
    return undefined;
  }

  return resources.every((resource) => latest.metersAfter[resource] === state.meters[resource])
    ? latest.effects
    : undefined;
}

export function GamePanel({
  state,
  pending,
  analytics,
  language,
  onChoose,
  onOpenAdvisor,
  advisorLabel,
  onRestart,
  onLanguageChange,
  onOpenRecords
}: GamePanelProps) {
  const t = text[language];
  const latestHistory = state.history[state.history.length - 1];
  const hudEffects = effectsMatchDisplayedMeters(state);
  const prompt = state.currentCard
    ? language === "zh"
      ? state.currentCard.promptZh ?? state.currentCard.prompt
      : state.currentCard.prompt
    : language === "zh"
      ? state.endingZh ?? state.ending
      : state.ending;
  const dangerMeters = resources.filter((resource) => state.meters[resource] < 18 || state.meters[resource] > 82).length;
  const maxDecisions = state.maxDecisions ?? 24;

  return (
    <main className="stage">
      <div className="sky" />
      <div className="moon" />
      <div className="mountains mountains-back" />
      <div className="mountains mountains-front" />
      <div className="ground" />

      <aside className="side-stat left-stat">
        <strong>{state.yearsInPower}</strong>
        <span>{t.campusWeeks}</span>
      </aside>
      <aside className="side-stat right-stat">
        <strong>{state.year}</strong>
      </aside>

      <section className="game-panel">
        <div className="top-actions" aria-label="Game controls">
          <button type="button" onClick={onOpenAdvisor}>{advisorLabel ?? "Clone"}</button>
          <button type="button" onClick={onOpenRecords}>{t.records}</button>
          <LanguageSwitch language={language} onChange={onLanguageChange} />
        </div>

        <Hud meters={state.meters} language={language} effects={hudEffects} />

        <div className="parchment">
          <p className="prompt">{prompt}</p>

          {state.currentCard && (
            <DecisionCard card={state.currentCard} language={language} pending={pending} onChoose={onChoose} />
          )}

          {state.ended && (
            <div className="ending">
              <span className="ending-kicker">{t.runEnded}</span>
              <strong>{language === "zh" ? state.endingZh ?? state.ending : state.ending}</strong>
              <div className="ending-stats">
                <span>{t.decisionsBeforeEnding}: <b>{state.history.length}</b></span>
                <span>{t.dangerMeters}: <b>{dangerMeters}</b></span>
              </div>
              <div className="ending-actions">
                <button type="button" className="ending-report-button" onClick={onOpenRecords}>
                  {t.viewRunReport}
                </button>
                <button type="button" onClick={onRestart}>
                  {t.newSemester}
                </button>
              </div>
            </div>
          )}
        </div>

        <footer className="ruler-bar">
          <div>
            <strong>{state.rulerName}</strong>
            <span>{language === "zh" ? `${t.week} ${state.yearsInPower} 周` : `${t.week} ${state.yearsInPower}`}</span>
          </div>
          <div className="year">{state.year}</div>
        </footer>

        <div className="objective-bar">
          <span className="tiny-portrait" />
          {resources.map((resource) => (
            <span
              className={`objective-dot ${state.meters[resource] < 18 || state.meters[resource] > 82 ? "danger" : ""}`}
              key={resource}
            />
          ))}
        </div>
      </section>

      <aside className="quest-log run-status">
        <strong>{t.runStatus}</strong>
        <span>{t.decisionsMade}: {analytics?.decisions ?? state.history.length}/{maxDecisions}</span>
        <span>{t.queuedLinks}: {state.scheduledCount}</span>
        <span>{t.dangerMeters}: {dangerMeters}</span>
      </aside>

      {latestHistory && !state.ended && (
        <div className="outcome-toast">
          {language === "zh" ? latestHistory.outcomeLabelZh ?? latestHistory.outcomeLabel : latestHistory.outcomeLabel}
        </div>
      )}
    </main>
  );
}
