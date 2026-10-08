/**
 * Vector path conversion engine for text elements.
 * Converts text strings into SVG vector path data without canvas font dependencies.
 */

export interface TextToPathOptions {
  fontSize?: number;
  startX?: number;
  startY?: number;
}

// Glyph definitions on a normalized 100x100 box
// Baseline at y=0, cap height at y=-70, descender at y=20
const GLYPH_PATHS: Record<string, { path: string; advance: number }> = {
  // Uppercase
  'A': { path: 'M 10 0 L 50 -70 L 90 0 M 25 -25 L 75 -25', advance: 0.65 },
  'B': { path: 'M 10 0 L 10 -70 L 60 -70 C 80 -70 80 -40 60 -40 L 10 -40 M 10 -40 L 65 -40 C 85 -40 85 0 60 0 Z', advance: 0.65 },
  'C': { path: 'M 80 -15 C 20 -15 20 -55 80 -55', advance: 0.6 },
  'D': { path: 'M 10 0 L 10 -70 L 50 -70 C 90 -70 90 0 50 0 Z', advance: 0.65 },
  'E': { path: 'M 80 0 L 10 0 L 10 -70 L 80 -70 M 10 -35 L 70 -35', advance: 0.55 },
  'F': { path: 'M 10 0 L 10 -70 L 80 -70 M 10 -35 L 70 -35', advance: 0.5 },
  'G': { path: 'M 80 -55 C 20 -55 20 -15 80 -15 L 80 -35 L 50 -35', advance: 0.65 },
  'H': { path: 'M 10 0 L 10 -70 M 10 -35 L 70 -35 M 70 0 L 70 -70', advance: 0.65 },
  'I': { path: 'M 20 0 L 40 0 M 30 0 L 30 -70 M 20 -70 L 40 -70', advance: 0.35 },
  'J': { path: 'M 10 -20 C 10 0 50 0 50 -20 L 50 -70 L 30 -70', advance: 0.45 },
  'K': { path: 'M 10 0 L 10 -70 M 10 -35 L 65 -70 M 20 -25 L 70 0', advance: 0.6 },
  'L': { path: 'M 10 -70 L 10 0 L 70 0', advance: 0.5 },
  'M': { path: 'M 10 0 L 10 -70 L 45 -20 L 80 -70 L 80 0', advance: 0.75 },
  'N': { path: 'M 10 0 L 10 -70 L 70 0 L 70 -70', advance: 0.65 },
  'O': { path: 'M 45 0 C 10 0 10 -70 45 -70 C 80 -70 80 0 45 0 Z', advance: 0.65 },
  'P': { path: 'M 10 0 L 10 -70 L 55 -70 C 80 -70 80 -35 55 -35 L 10 -35', advance: 0.55 },
  'Q': { path: 'M 45 0 C 10 0 10 -70 45 -70 C 80 -70 80 0 45 0 Z M 50 -20 L 75 10', advance: 0.65 },
  'R': { path: 'M 10 0 L 10 -70 L 55 -70 C 80 -70 80 -35 55 -35 L 10 -35 M 40 -35 L 75 0', advance: 0.6 },
  'S': { path: 'M 75 -55 C 20 -75 20 -40 75 -30 C 75 0 15 0 15 -15', advance: 0.55 },
  'T': { path: 'M 10 -70 L 70 -70 M 40 -70 L 40 0', advance: 0.5 },
  'U': { path: 'M 10 -70 L 10 -20 C 10 0 70 0 70 -20 L 70 -70', advance: 0.6 },
  'V': { path: 'M 10 -70 L 40 0 L 70 -70', advance: 0.55 },
  'W': { path: 'M 10 -70 L 25 0 L 45 -40 L 65 0 L 80 -70', advance: 0.75 },
  'X': { path: 'M 10 -70 L 70 0 M 70 -70 L 10 0', advance: 0.55 },
  'Y': { path: 'M 10 -70 L 40 -35 L 70 -70 M 40 -35 L 40 0', advance: 0.55 },
  'Z': { path: 'M 10 -70 L 70 -70 L 10 0 L 70 0', advance: 0.55 },

  // Lowercase
  'a': { path: 'M 60 0 L 60 -45 C 10 -45 10 0 60 0 Z M 10 -20 C 10 -45 60 -45 60 -20', advance: 0.5 },
  'b': { path: 'M 10 -70 L 10 0 C 60 0 60 -45 10 -45', advance: 0.5 },
  'c': { path: 'M 60 -10 C 10 -10 10 -40 60 -40', advance: 0.45 },
  'd': { path: 'M 60 -70 L 60 0 C 10 0 10 -45 60 -45', advance: 0.5 },
  'e': { path: 'M 10 -25 L 60 -25 C 60 -45 10 -45 10 -20 C 10 0 60 0 60 -10', advance: 0.45 },
  'f': { path: 'M 40 -70 C 20 -70 20 -50 20 -50 L 20 0 M 5 -40 L 35 -40', advance: 0.35 },
  'g': { path: 'M 60 -45 L 60 15 C 60 30 10 30 10 15 M 60 -45 C 10 -45 10 0 60 0 Z', advance: 0.5 },
  'h': { path: 'M 10 -70 L 10 0 M 10 -35 C 10 -45 55 -45 55 0 L 55 0', advance: 0.5 },
  'i': { path: 'M 20 -70 L 20 -60 M 20 -45 L 20 0', advance: 0.25 },
  'j': { path: 'M 30 -70 L 30 -60 M 30 -45 L 30 15 C 30 30 10 30 10 15', advance: 0.25 },
  'k': { path: 'M 10 -70 L 10 0 M 10 -20 L 50 -45 M 20 -25 L 55 0', advance: 0.45 },
  'l': { path: 'M 20 -70 L 20 0', advance: 0.25 },
  'm': { path: 'M 10 -45 L 10 0 M 10 -30 C 10 -45 40 -45 40 0 M 40 -30 C 40 -45 70 -45 70 0', advance: 0.7 },
  'n': { path: 'M 10 -45 L 10 0 M 10 -30 C 10 -45 55 -45 55 0', advance: 0.5 },
  'o': { path: 'M 35 0 C 10 0 10 -45 35 -45 C 60 -45 60 0 35 0 Z', advance: 0.5 },
  'p': { path: 'M 10 -45 L 10 25 M 10 -45 C 60 -45 60 0 10 0', advance: 0.5 },
  'q': { path: 'M 60 -45 L 60 25 M 60 -45 C 10 -45 10 0 60 0', advance: 0.5 },
  'r': { path: 'M 10 -45 L 10 0 M 10 -30 C 10 -45 50 -45 50 -35', advance: 0.35 },
  's': { path: 'M 50 -35 C 10 -45 10 -25 50 -20 C 50 0 10 0 10 -10', advance: 0.4 },
  't': { path: 'M 20 -60 L 20 0 C 20 0 35 0 35 -10 M 10 -45 L 30 -45', advance: 0.35 },
  'u': { path: 'M 10 -45 L 10 -10 C 10 0 55 0 55 -10 L 55 -45', advance: 0.5 },
  'v': { path: 'M 10 -45 L 30 0 L 50 -45', advance: 0.45 },
  'w': { path: 'M 10 -45 L 20 0 L 35 -30 L 50 0 L 60 -45', advance: 0.65 },
  'x': { path: 'M 10 -45 L 50 0 M 50 -45 L 10 0', advance: 0.45 },
  'y': { path: 'M 10 -45 L 30 0 L 50 -45 M 30 0 L 20 25 C 15 30 5 25 5 20', advance: 0.45 },
  'z': { path: 'M 10 -45 L 50 -45 L 10 0 L 50 0', advance: 0.4 },

  // Numbers
  '0': { path: 'M 30 0 C 10 0 10 -70 30 -70 C 50 -70 50 0 30 0 Z M 10 0 L 50 -70', advance: 0.5 },
  '1': { path: 'M 15 -50 L 30 -70 L 30 0 M 15 0 L 45 0', advance: 0.4 },
  '2': { path: 'M 10 -55 C 10 -70 50 -70 50 -50 C 50 -30 10 -20 10 0 L 50 0', advance: 0.5 },
  '3': { path: 'M 10 -70 L 50 -70 L 25 -40 C 50 -40 50 0 10 0', advance: 0.5 },
  '4': { path: 'M 40 0 L 40 -70 L 10 -30 L 55 -30', advance: 0.5 },
  '5': { path: 'M 50 -70 L 10 -70 L 10 -40 C 50 -40 50 0 10 -10', advance: 0.5 },
  '6': { path: 'M 45 -70 C 10 -70 10 0 30 0 C 50 0 50 -35 10 -35', advance: 0.5 },
  '7': { path: 'M 10 -70 L 50 -70 L 20 0', advance: 0.5 },
  '8': { path: 'M 30 -70 C 10 -70 10 -35 30 -35 C 50 -35 50 -70 30 -70 Z M 30 -35 C 10 -35 10 0 30 0 C 50 0 50 -35 30 -35 Z', advance: 0.5 },
  '9': { path: 'M 50 -35 C 10 -35 10 -70 30 -70 C 50 -70 50 0 10 0', advance: 0.5 },

  // Space & punctuation
  ' ': { path: '', advance: 0.3 },
  '!': { path: 'M 15 -70 L 15 -20 M 15 -10 L 15 0', advance: 0.25 },
  '?': { path: 'M 10 -55 C 10 -70 40 -70 40 -50 C 40 -30 25 -30 25 -15 M 25 -5 L 25 0', advance: 0.45 },
  '.': { path: 'M 15 -10 L 15 0', advance: 0.25 },
  ',': { path: 'M 15 -10 L 15 0 L 10 10', advance: 0.25 },
  '-': { path: 'M 10 -35 L 40 -35', advance: 0.4 },
  '_': { path: 'M 0 0 L 50 0', advance: 0.5 },
  ':': { path: 'M 15 -45 L 15 -35 M 15 -10 L 15 0', advance: 0.25 },
  ';': { path: 'M 15 -45 L 15 -35 M 15 -10 L 15 0 L 10 10', advance: 0.25 },
  '"': { path: 'M 15 -70 L 15 -50 M 30 -70 L 30 -50', advance: 0.35 },
  '\'': { path: 'M 15 -70 L 15 -50', advance: 0.2 },

  // Generic fallback
  'fallback': { path: 'M 5 -60 L 35 -60 L 35 0 L 5 0 Z', advance: 0.4 }
};

export function convertTextToPath(
  text: string,
  fontSize: number = 16,
  startX: number = 0,
  startY: number = 0
): string {
  if (!text) return '';

  const scale = fontSize / 100;
  let cursorX = startX;
  let cursorY = startY;
  const pathParts: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '\n') {
      cursorX = startX;
      cursorY += fontSize * 1.2;
      continue;
    }

    const glyph = GLYPH_PATHS[char] || GLYPH_PATHS['fallback'];
    if (glyph.path) {
      const transformedPath = transformGlyphPath(glyph.path, scale, cursorX, cursorY);
      if (transformedPath) {
        pathParts.push(transformedPath);
      }
    }

    cursorX += glyph.advance * fontSize;
  }

  return pathParts.join(' ');
}

function transformGlyphPath(
  pathStr: string,
  scale: number,
  offsetX: number,
  offsetY: number
): string {
  const tokens = pathStr.trim().split(/[\s,]+/);
  if (tokens.length === 0 || (tokens.length === 1 && tokens[0] === '')) return '';

  const result: string[] = [];
  let idx = 0;

  while (idx < tokens.length) {
    const command = tokens[idx];
    if (!command) {
      idx++;
      continue;
    }

    const cmdChar = command.toUpperCase();

    if (cmdChar === 'M' || cmdChar === 'L') {
      const x = parseFloat(tokens[idx + 1] || '0');
      const y = parseFloat(tokens[idx + 2] || '0');
      const tx = (x * scale + offsetX).toFixed(2);
      const ty = (y * scale + offsetY).toFixed(2);
      result.push(`${cmdChar} ${tx} ${ty}`);
      idx += 3;
    } else if (cmdChar === 'C') {
      const x1 = parseFloat(tokens[idx + 1] || '0');
      const y1 = parseFloat(tokens[idx + 2] || '0');
      const x2 = parseFloat(tokens[idx + 3] || '0');
      const y2 = parseFloat(tokens[idx + 4] || '0');
      const x = parseFloat(tokens[idx + 5] || '0');
      const y = parseFloat(tokens[idx + 6] || '0');

      const tx1 = (x1 * scale + offsetX).toFixed(2);
      const ty1 = (y1 * scale + offsetY).toFixed(2);
      const tx2 = (x2 * scale + offsetX).toFixed(2);
      const ty2 = (y2 * scale + offsetY).toFixed(2);
      const tx = (x * scale + offsetX).toFixed(2);
      const ty = (y * scale + offsetY).toFixed(2);

      result.push(`C ${tx1} ${ty1} ${tx2} ${ty2} ${tx} ${ty}`);
      idx += 7;
    } else if (cmdChar === 'Z') {
      result.push('Z');
      idx += 1;
    } else {
      idx++;
    }
  }

  return result.join(' ');
}
