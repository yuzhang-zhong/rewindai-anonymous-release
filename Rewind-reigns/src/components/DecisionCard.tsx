import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { text } from "../i18n";
import type { Direction, GameCard, GameOption, Language } from "../types";
import { Portrait } from "./Portrait";

const threshold = 82;
const flyDistance = 560;

type DragState = {
  active: boolean;
  exiting: Direction | null;
  startX: number;
  startY: number;
  x: number;
  y: number;
};

type DecisionCardProps = {
  card: GameCard;
  language: Language;
  pending: boolean;
  onChoose: (direction: Direction) => void;
};

function dominantDirection(x: number, y: number): Direction | null {
  if (Math.max(Math.abs(x), Math.abs(y)) < threshold) {
    return null;
  }

  if (Math.abs(x) > Math.abs(y)) {
    return x < 0 ? "left" : "right";
  }

  return y < 0 ? "up" : "down";
}

function optionText(option: GameOption, language: Language) {
  return language === "zh" ? option.textZh ?? option.text : option.text;
}

export function DecisionCard({ card, language, pending, onChoose }: DecisionCardProps) {
  const [drag, setDrag] = useState<DragState>({ active: false, exiting: null, startX: 0, startY: 0, x: 0, y: 0 });
  const directionNames = text[language].directionNames;
  const availableDirections = useMemo(() => new Set(card.options.map((option) => option.direction)), [card]);
  const activeDirection = dominantDirection(drag.x, drag.y);
  const activeOption = card.options.find((option) => option.direction === activeDirection);
  const swipeProgress = Math.min(1, Math.max(Math.abs(drag.x), Math.abs(drag.y)) / 160);

  useEffect(() => {
    setDrag({ active: false, exiting: null, startX: 0, startY: 0, x: 0, y: 0 });
  }, [card.id]);

  function choose(direction: Direction) {
    if (pending || !availableDirections.has(direction)) {
      return;
    }
    onChoose(direction);
  }

  function flyToward(direction: Direction) {
    const vectors: Record<Direction, { x: number; y: number }> = {
      left: { x: -flyDistance, y: 36 },
      right: { x: flyDistance, y: 36 },
      up: { x: 16, y: -flyDistance },
      down: { x: -16, y: flyDistance }
    };

    setDrag((current) => ({
      ...current,
      active: false,
      exiting: direction,
      x: vectors[direction].x,
      y: vectors[direction].y
    }));

    window.setTimeout(() => choose(direction), 150);
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (pending) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ active: true, exiting: null, startX: event.clientX, startY: event.clientY, x: 0, y: 0 });
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.active) {
      return;
    }
    setDrag((current) => ({
      ...current,
      x: event.clientX - current.startX,
      y: event.clientY - current.startY
    }));
  }

  function onPointerUp() {
    const direction = dominantDirection(drag.x, drag.y);
    if (direction && availableDirections.has(direction)) {
      flyToward(direction);
      return;
    }
    setDrag({ active: false, exiting: null, startX: 0, startY: 0, x: 0, y: 0 });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const keyMap: Partial<Record<string, Direction>> = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down"
    };
    const direction = keyMap[event.key];
    if (!direction) {
      return;
    }
    event.preventDefault();
    flyToward(direction);
  }

  const verticalLean = Math.abs(drag.y) > Math.abs(drag.x) ? drag.y / 32 : 0;
  const rotation = Math.max(-22, Math.min(22, drag.x / 14 + verticalLean));
  const scale = drag.active ? 1 + swipeProgress * 0.025 : 1;
  const style = {
    "--swipe-progress": swipeProgress,
    transform: `translate3d(${drag.x}px, ${drag.y}px, 0) rotate(${rotation}deg) scale(${scale})`
  } as CSSProperties;

  const cardClass = [
    "choice-card",
    drag.active ? "is-dragging" : "",
    drag.exiting ? "is-exiting" : "",
    pending ? "is-pending" : "",
    activeDirection ? `is-${activeDirection}` : ""
  ]
    .filter(Boolean)
    .join(" ");

  const stampLabel = activeOption ? optionText(activeOption, language) : "DRAG";
  const stampDirection = activeDirection ?? "right";

  const clickHint = (direction: Direction) => {
    if (pending || !availableDirections.has(direction)) {
      return;
    }
    flyToward(direction);
  };

  return (
    <section className="decision-zone" aria-label="Decision card">
      <div className="direction-hints">
        {card.options.map((option) => (
          <button
            className={`hint hint-${option.direction} ${activeDirection === option.direction ? "is-active" : ""}`}
            key={option.direction}
            onClick={() => clickHint(option.direction)}
            disabled={pending}
            type="button"
          >
            <span>{directionNames[option.direction]}</span>
            <strong>{optionText(option, language)}</strong>
          </button>
        ))}
      </div>

      <div className="shadow-card" />
      <div
        className={cardClass}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        role="button"
        tabIndex={0}
        style={style}
        aria-label="Decision card"
      >
        <div className={`swipe-stamp stamp-${stampDirection}`}>{stampLabel}</div>
        <div className="card-rail">
          <span />
          <span />
          <span />
        </div>
        <div className="card-header">
          <span>Campus</span>
          <strong>{language === "zh" ? card.speakerZh ?? card.speaker : card.speaker}</strong>
        </div>
        <Portrait variant={card.portrait} />
      </div>
    </section>
  );
}
