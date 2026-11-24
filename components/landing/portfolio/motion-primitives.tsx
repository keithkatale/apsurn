import type { CSSProperties, ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
};

function style(delay: number, duration: number): CSSProperties {
  return { "--apsurn-delay": `${delay}s`, "--apsurn-dur": `${duration}s` } as CSSProperties;
}

/** CSS-driven entrance so server-rendered content is never stuck invisible waiting on hydration. */
export function FadeIn({ children, delay = 0, duration = 0.8, className }: RevealProps): ReactNode {
  return (
    <div className={`apsurn-fade-in ${className ?? ""}`} style={style(delay, duration)}>
      {children}
    </div>
  );
}

export function ScaleUnblur({ children, delay = 0, duration = 1, className }: RevealProps): ReactNode {
  return (
    <div className={`apsurn-scale-unblur ${className ?? ""}`} style={style(delay, duration)}>
      {children}
    </div>
  );
}
