export function transpileComponent(source: string): string;
export function buildAnimationFrameHtml(
  source: string,
  opts?: {
    cdn?: string;
    playing?: boolean;
    speed?: number;
    step?: number;
    loop?: boolean;
    reducedMotion?: boolean;
    width?: number;
  },
): string;
