import { Frame, Glass, GlassContainer, Html, LiquidCanvas } from "@liquid-dom/react";
import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { isLiquidGlassSupported } from "./liquidGlassSupport";

interface LiquidGlassProps {
  children: ReactNode;
  /** Fills its positioned parent (absolute inset:0) and measures itself. The parent must have a
   *  definite size + position:relative/absolute. */
  cornerRadius?: number;
  blur?: number;
  className?: string;
  style?: CSSProperties;
}

export function LiquidGlass({
  children,
  cornerRadius = 22,
  blur = 14,
  className,
  style,
}: LiquidGlassProps) {
  const supported = useMemo(isLiquidGlassSupported, []);
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    if (!supported) return;
    const el = hostRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [supported]);

  // Fallback (the common case): a real frosted-glass panel, works in every browser.
  if (!supported) {
    return (
      <div
        className={`liquid-glass-fallback ${className ?? ""}`}
        style={{ borderRadius: cornerRadius, ...style }}
      >
        {children}
      </div>
    );
  }

  return (
    <div ref={hostRef} className={className} style={{ position: "absolute", inset: 0, ...style }}>
      <LiquidCanvas
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        onError={() => {
          /* frame-loop hiccup — swallow rather than crash the cockpit */
        }}
      >
        {size.w > 0 && size.h > 0 && (
          <GlassContainer blur={blur}>
            <Frame width={size.w} height={size.h}>
              <Glass cornerRadius={cornerRadius} pointerEvents>
                <Html sizing="fill">{children}</Html>
              </Glass>
            </Frame>
          </GlassContainer>
        )}
      </LiquidCanvas>
    </div>
  );
}
