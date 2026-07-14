import { test, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { secureProjectWriter } from './writerUtils';
import * as os from 'os';

test('secureProjectWriter - rejects non-JSON data', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'writer-test-'));
  const file = path.join(tmpDir, 'test1.json');
  await expect(secureProjectWriter(file, 'not-json')).rejects.toThrow(/Must be valid JSON/);
});

test('secureProjectWriter - rejects wrong extension', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'writer-test-'));
  const file = path.join(tmpDir, 'test2.txt');
  const data = JSON.stringify({ scene: {}, metadata: {} });
  await expect(secureProjectWriter(file, data)).rejects.toThrow(/Unauthorized file extension/);
});

test('secureProjectWriter - rejects missing root keys (missing metadata)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'writer-test-'));
  const file = path.join(tmpDir, 'test3.json');
  const data = JSON.stringify({ scene: {} });
  await expect(secureProjectWriter(file, data)).rejects.toThrow(/Missing mandatory fields/);
});

test('secureProjectWriter - rejects missing root keys (missing scene)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'writer-test-'));
  const file = path.join(tmpDir, 'test4.json');
  const data = JSON.stringify({ metadata: {} });
  await expect(secureProjectWriter(file, data)).rejects.toThrow(/Missing mandatory fields/);
});

test('secureProjectWriter - successfully writes valid project', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'writer-test-'));
  const file = path.join(tmpDir, 'test5.json');
  const data = JSON.stringify({ scene: {}, metadata: { version: '1.0' } });
  const result = await secureProjectWriter(file, data);
  expect(result).toBe(true);
  
  const written = fs.readFileSync(file, 'utf-8');
  expect(written).toBe(data);
});
