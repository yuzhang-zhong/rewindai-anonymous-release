type PortraitProps = {
  variant: string;
};

export function Portrait({ variant }: PortraitProps) {
  return (
    <div className={`portrait portrait-${variant}`} aria-hidden="true">
      <div className="portrait-hood" />
      <div className="portrait-neck" />
      <div className="portrait-face face-left" />
      <div className="portrait-face face-right" />
      <div className="portrait-nose" />
      <div className="portrait-eye eye-left" />
      <div className="portrait-eye eye-right" />
      <div className="portrait-body body-left" />
      <div className="portrait-body body-right" />
      <div className="portrait-prop" />
    </div>
  );
}
