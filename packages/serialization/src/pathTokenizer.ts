export interface PathToken {
  type: string;
  args: number[];
}

export function tokenizePath(pathData: string): PathToken[] {
  const commands = pathData.match(/[a-df-z][^a-df-z]*/ig) || [];
  const tokens: PathToken[] = [];

  for (const cmd of commands) {
    const type = cmd[0];
    const argsStr = cmd.slice(1).trim();
    const args = argsStr ? argsStr.split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n)) : [];

    // Split into proper argument lengths depending on command
    if (args.length > 0) {
      let step = 2; // Default for M, L, T
      switch (type.toUpperCase()) {
        case 'H': case 'V': step = 1; break;
        case 'M': case 'L': case 'T': step = 2; break;
        case 'S': case 'Q': step = 4; break;
        case 'C': step = 6; break;
        case 'A': step = 7; break;
        case 'Z': step = 0; break;
      }

      if (step > 0 && args.length >= step) {
        for (let i = 0; i < args.length; i += step) {
          const typeSub = (i === 0 || type.toUpperCase() !== 'M') ? type : (type === 'm' ? 'l' : 'L');
          tokens.push({ type: typeSub, args: args.slice(i, i + step) });
        }
      } else {
         tokens.push({ type, args });
      }
    } else {
      tokens.push({ type, args: [] });
    }
  }

  return tokens;
}

const COMMAND_TO_ID: Record<string, number> = {
  'M': 1, 'm': 2,
  'L': 3, 'l': 4,
  'H': 5, 'h': 6,
  'V': 7, 'v': 8,
  'C': 9, 'c': 10,
  'S': 11, 's': 12,
  'Q': 13, 'q': 14,
  'T': 15, 't': 16,
  'A': 17, 'a': 18,
  'Z': 19, 'z': 20
};

const ID_TO_COMMAND = Object.entries(COMMAND_TO_ID).reduce((acc, [k, v]) => {
  acc[v] = k;
  return acc;
}, {} as Record<number, string>);

export function serializeTokensToBinary(tokens: PathToken[]): Uint8Array {
  let floatCount = 0;
  for (const t of tokens) {
    floatCount += t.args.length;
  }
  
  const bufferSize = tokens.length * 2 + floatCount * 4;
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);
  
  let offset = 0;
  for (const t of tokens) {
    view.setUint8(offset, COMMAND_TO_ID[t.type] || 0);
    offset += 1;
    view.setUint8(offset, t.args.length);
    offset += 1;
    for (const arg of t.args) {
      view.setFloat32(offset, arg, true); // true for little-endian
      offset += 4;
    }
  }
  return new Uint8Array(buffer);
}

export function deserializeBinaryToTokens(buffer: ArrayBuffer): PathToken[] {
  const view = new DataView(buffer);
  const tokens: PathToken[] = [];
  let offset = 0;
  while (offset < buffer.byteLength) {
    const id = view.getUint8(offset);
    offset += 1;
    const argCount = view.getUint8(offset);
    offset += 1;
    const type = ID_TO_COMMAND[id] || 'M';
    const args = [];
    for (let i = 0; i < argCount; i++) {
      args.push(view.getFloat32(offset, true));
      offset += 4;
    }
    tokens.push({ type, args });
  }
  return tokens;
}
