import fs from 'node:fs';
import path from 'node:path';

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function snapshotPath(snapshotsDir: string, name: string): string {
  return path.join(snapshotsDir, `${name}.png`);
}

export function saveBaseline(snapshotsDir: string, name: string, data: Buffer): string {
  ensureDir(snapshotsDir);
  const filePath = snapshotPath(snapshotsDir, name);
  fs.writeFileSync(filePath, data);
  return filePath;
}

export function loadBaseline(snapshotsDir: string, name: string): Buffer | null {
  const filePath = snapshotPath(snapshotsDir, name);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath);
}

export function baselineExists(snapshotsDir: string, name: string): boolean {
  return fs.existsSync(snapshotPath(snapshotsDir, name));
}

export function saveDiffOutput(snapshotsDir: string, name: string, data: Buffer): string {
  const diffDir = path.join(snapshotsDir, '__diff_output__');
  ensureDir(diffDir);
  const filePath = path.join(diffDir, `${name}.png`);
  fs.writeFileSync(filePath, data);
  return filePath;
}
