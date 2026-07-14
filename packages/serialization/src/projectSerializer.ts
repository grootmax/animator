import { encode, decode } from '@msgpack/msgpack';

export class ProjectSerializer {
  static serializeBinary(data: any): Uint8Array {
    return encode(data);
  }

  static deserializeBinary(buffer: Uint8Array): any {
    return decode(buffer);
  }

  static deserialize(buffer: Uint8Array): any {
    // Check if it's JSON by looking at first non-whitespace character
    // 123 is '{', 91 is '['
    let isJson = false;
    for (let i = 0; i < buffer.length; i++) {
      const char = buffer[i];
      if (char === 32 || char === 9 || char === 10 || char === 13) continue; // skip whitespace
      if (char === 123 || char === 91) {
        isJson = true;
      }
      break;
    }

    if (isJson) {
      const text = new TextDecoder().decode(buffer);
      return JSON.parse(text);
    } else {
      return decode(buffer);
    }
  }
}
