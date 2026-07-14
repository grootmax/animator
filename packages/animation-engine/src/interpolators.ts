import { tokenizePath, PathToken } from '@monorepo/serialization';

export type Interpolator = (start: any, end: any, progress: number) => any;

export const numericInterpolator: Interpolator = (start: any, end: any, progress: number) => {
  return start + (end - start) * progress;
};

// Color Interpolator
function parseColor(color: string): [number, number, number] {
  if (typeof color !== 'string') return [0, 0, 0];
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    const num = parseInt(hex, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }
  return [0, 0, 0]; // Default fallback
}

function formatColor(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const clamped = Math.max(0, Math.min(255, Math.round(n)));
    const hex = clamped.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export const colorInterpolator: Interpolator = (start: any, end: any, progress: number) => {
  const [r1, g1, b1] = parseColor(start as string);
  const [r2, g2, b2] = parseColor(end as string);
  
  const r = r1 + (r2 - r1) * progress;
  const g = g1 + (g2 - g1) * progress;
  const b = b1 + (b2 - b1) * progress;
  
  return formatColor(r, g, b);
};

// Path Interpolator
function pathToString(tokens: PathToken[]): string {
  return tokens.map(t => {
    if (t.args.length === 0) return t.type;
    return `${t.type} ${t.args.join(' ')}`;
  }).join(' ');
}

export const pathInterpolator: Interpolator = (start: any, end: any, progress: number) => {
  const startTokens = tokenizePath(start as string);
  const endTokens = tokenizePath(end as string);
  
  // Guardrail Check: Ensure both paths have matching length and matching command types
  if (startTokens.length !== endTokens.length) {
    return progress < 0.5 ? start : end;
  }
  
  for (let i = 0; i < startTokens.length; i++) {
    if (startTokens[i].type.toLowerCase() !== endTokens[i].type.toLowerCase() || 
        startTokens[i].args.length !== endTokens[i].args.length) {
      return progress < 0.5 ? start : end;
    }
  }
  
  const interpolatedTokens: PathToken[] = [];
  for (let i = 0; i < startTokens.length; i++) {
    const sTok = startTokens[i];
    const eTok = endTokens[i];
    const args: number[] = [];
    for (let j = 0; j < sTok.args.length; j++) {
      args.push(sTok.args[j] + (eTok.args[j] - sTok.args[j]) * progress);
    }
    // We keep the original command casing from start
    interpolatedTokens.push({ type: sTok.type, args });
  }
  
  return pathToString(interpolatedTokens);
};

export function getInterpolator(property: string, startValue: any): Interpolator {
  if (property === 'fill' || property === 'stroke') {
    return colorInterpolator;
  }
  if (property === 'pathData') {
    return pathInterpolator;
  }
  if (typeof startValue === 'string' && startValue.startsWith('#')) {
    return colorInterpolator;
  }
  return numericInterpolator;
}
