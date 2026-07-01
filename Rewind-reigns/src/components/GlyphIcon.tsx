import type { ResourceKey } from "../types";

type GlyphIconProps = {
  resource: ResourceKey;
};

export function GlyphIcon({ resource }: GlyphIconProps) {
  return (
    <svg className={`glyph glyph-${resource}`} viewBox="0 0 48 48" aria-hidden="true">
      {resource === "faith" && (
        <>
          <path d="M8 10h14c4 0 6 2 6 6v24H14c-4 0-6-2-6-6Z" />
          <path d="M40 10H26c-4 0-6 2-6 6v24h14c4 0 6-2 6-6Z" opacity="0.72" />
          <rect x="22" y="12" width="4" height="29" rx="1" />
        </>
      )}
      {resource === "people" && (
        <>
          <circle cx="24" cy="11" r="5" />
          <rect x="20" y="17" width="8" height="20" rx="2" />
          <rect x="8" y="20" width="32" height="6" rx="2" />
          <rect x="15" y="34" width="7" height="10" rx="1" />
          <rect x="26" y="34" width="7" height="10" rx="1" />
        </>
      )}
      {resource === "military" && (
        <>
          <path d="M27 3 10 27h13l-3 18 18-26H25Z" />
        </>
      )}
      {resource === "wealth" && (
        <>
          <circle cx="24" cy="24" r="18" />
          <path d="M29 15c-7-3-13 0-13 5 0 8 17 4 17 13 0 6-8 8-15 4" fill="none" stroke="#152238" strokeLinecap="round" strokeWidth="4" />
          <rect x="22" y="12" width="4" height="24" rx="1" fill="#152238" />
        </>
      )}
    </svg>
  );
}
