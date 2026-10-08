export class StringTable {
  private stringToIndex: Map<string, number> = new Map();
  private strings: string[] = [];
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  constructor(initialStrings: string[] = []) {
    for (const str of initialStrings) {
      this.getOrAdd(str);
    }
  }

  public getOrAdd(str: string): number {
    const existing = this.stringToIndex.get(str);
    if (existing !== undefined) {
      return existing;
    }
    const index = this.strings.length;
    this.strings.push(str);
    this.stringToIndex.set(str, index);
    return index;
  }

  public getString(index: number): string | undefined {
    return this.strings[index];
  }

  public get count(): number {
    return this.strings.length;
  }

  public get allStrings(): readonly string[] {
    return this.strings;
  }

  public encodeToBinary(): { indexTable: Int32Array; byteBuffer: Uint8Array } {
    const encodedBytesList: Uint8Array[] = [];
    let totalBytes = 0;

    for (const str of this.strings) {
      const bytes = this.encoder.encode(str);
      encodedBytesList.push(bytes);
      totalBytes += bytes.length;
    }

    const indexTable = new Int32Array(this.strings.length * 2);
    const byteBuffer = new Uint8Array(totalBytes);

    let currentOffset = 0;
    for (let i = 0; i < this.strings.length; i++) {
      const bytes = encodedBytesList[i];
      if (!bytes) continue;
      indexTable[i * 2] = currentOffset;
      indexTable[i * 2 + 1] = bytes.length;
      byteBuffer.set(bytes, currentOffset);
      currentOffset += bytes.length;
    }

    return { indexTable, byteBuffer };
  }

  public static decodeFromBinary(
    stringCount: number,
    indexTable: Int32Array,
    byteBuffer: Uint8Array,
  ): StringTable {
    const decoder = new TextDecoder();
    const strings: string[] = [];

    for (let i = 0; i < stringCount; i++) {
      const offset = indexTable[i * 2] ?? 0;
      const length = indexTable[i * 2 + 1] ?? 0;
      const strBytes = byteBuffer.subarray(offset, offset + length);
      strings.push(decoder.decode(strBytes));
    }

    return new StringTable(strings);
  }
}
