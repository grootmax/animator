import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import * as fs from 'fs';
import { secureProjectWriter } from './writerUtils';
import * as os from 'os';

test('secureProjectWriter', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'writer-test-'));

  await t.test('rejects non-JSON data', async () => {
    const file = path.join(tmpDir, 'test1.json');
    await assert.rejects(
      secureProjectWriter(file, 'not-json'),
      { message: /Must be valid JSON/ }
    );
  });

  await t.test('rejects wrong extension', async () => {
    const file = path.join(tmpDir, 'test2.txt');
    const data = JSON.stringify({ scene: {}, metadata: {} });
    await assert.rejects(
      secureProjectWriter(file, data),
      { message: /Unauthorized file extension/ }
    );
  });

  await t.test('rejects missing root keys (missing metadata)', async () => {
    const file = path.join(tmpDir, 'test3.json');
    const data = JSON.stringify({ scene: {} });
    await assert.rejects(
      secureProjectWriter(file, data),
      { message: /Missing mandatory fields/ }
    );
  });

  await t.test('rejects missing root keys (missing scene)', async () => {
    const file = path.join(tmpDir, 'test4.json');
    const data = JSON.stringify({ metadata: {} });
    await assert.rejects(
      secureProjectWriter(file, data),
      { message: /Missing mandatory fields/ }
    );
  });

  await t.test('successfully writes valid project', async () => {
    const file = path.join(tmpDir, 'test5.json');
    const data = JSON.stringify({ scene: {}, metadata: { version: '1.0' } });
    const result = await secureProjectWriter(file, data);
    assert.equal(result, true);
    
    const written = fs.readFileSync(file, 'utf-8');
    assert.equal(written, data);
  });
});
