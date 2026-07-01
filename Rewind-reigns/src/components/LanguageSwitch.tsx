import type { Language } from "../types";

type LanguageSwitchProps = {
  language: Language;
  onChange: (language: Language) => void;
  label?: string;
};

const options: Array<{ value: Language; label: string }> = [
  { value: "en", label: "EN" },
  { value: "zh", label: "中文" }
];

export function LanguageSwitch({ language, onChange, label }: LanguageSwitchProps) {
  return (
    <div className="language-switch" aria-label={label ?? "Language"}>
      {label && <span className="language-switch-label">{label}</span>}
      <div className="language-switch-options" role="group">
        {options.map((option) => (
          <button
            aria-pressed={language === option.value}
            className={language === option.value ? "is-active" : ""}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
