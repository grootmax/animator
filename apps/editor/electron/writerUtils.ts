import * as fs from 'fs';
import * as path from 'path';

export async function secureProjectWriter(filePath: string, content: string): Promise<boolean> {
  // 1. Enforce authorized file extension (JSON)
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.json') {
    throw new Error('Unauthorized file extension. Project files must be .json');
  }

  // 2. Verify incoming data is valid JSON
  let data: any;
  try {
    data = JSON.parse(content);
  } catch (err) {
    throw new Error('Invalid project data. Must be valid JSON.');
  }

  // 3. Structural check to ensure mandatory top-level project fields are present
  // Based on the application structure, we check for 'scene' and 'metadata'.
  const hasScene = typeof data === 'object' && data !== null && 'scene' in data;
  const hasMetadata = typeof data === 'object' && data !== null && 'metadata' in data;

  if (!hasScene || !hasMetadata) {
    throw new Error('Invalid project structure. Missing mandatory fields: scene, metadata.');
  }

  // 4. Perform disk operation
  await fs.promises.writeFile(filePath, content, 'utf-8');
  return true;
}
