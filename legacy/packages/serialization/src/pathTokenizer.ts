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
