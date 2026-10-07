import { describe, test, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { secureProjectWriter } from './writerUtils';
import * as os from 'os';

describe('secureProjectWriter', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'writer-test-'));

  test('rejects non-JSON data', async () => {
    const file = path.join(tmpDir, 'test1.json');
    await expect(secureProjectWriter(file, 'not-json')).rejects.toThrow(/Must be valid JSON/);
  });

  test('rejects wrong extension', async () => {
    const file = path.join(tmpDir, 'test2.txt');
    const data = JSON.stringify({ scene: {}, metadata: {} });
    await expect(secureProjectWriter(file, data)).rejects.toThrow(/Unauthorized file extension/);
  });

  test('rejects missing root keys (missing metadata)', async () => {
    const file = path.join(tmpDir, 'test3.json');
    const data = JSON.stringify({ scene: {} });
    await expect(secureProjectWriter(file, data)).rejects.toThrow(/Missing mandatory fields/);
  });

  test('rejects missing root keys (missing scene)', async () => {
    const file = path.join(tmpDir, 'test4.json');
    const data = JSON.stringify({ metadata: {} });
    await expect(secureProjectWriter(file, data)).rejects.toThrow(/Missing mandatory fields/);
  });

  test('successfully writes valid project', async () => {
    const file = path.join(tmpDir, 'test5.json');
    const data = JSON.stringify({ scene: {}, metadata: { version: '1.0' } });
    const result = await secureProjectWriter(file, data);
    expect(result).toBe(true);
    
    const written = fs.readFileSync(file, 'utf-8');
    expect(written).toBe(data);
  });
});
