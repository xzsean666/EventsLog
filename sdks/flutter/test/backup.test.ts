import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BackupManager } from '../src/backup/backup_manager.js';

describe('Backup Manager', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eventslog-flutter-backup-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('backs up and restores files with exact byte fidelity', () => {
    const manager = new BackupManager(tmpDir);
    const subDir = path.join(tmpDir, 'lib', 'services');
    fs.mkdirSync(subDir, { recursive: true });

    const originalContent = 'class OrderService {\n  void execute() {}\n}\n';
    const filePath = path.join(subDir, 'order.dart');
    fs.writeFileSync(filePath, originalContent, 'utf8');

    expect(manager.hasBackup()).toBe(false);

    // Perform backup
    manager.backupFile('lib/services/order.dart');
    manager.saveManifest();

    expect(manager.hasBackup()).toBe(true);
    expect(manager.getStatus().filesCount).toBe(1);

    // Modify file
    fs.writeFileSync(filePath, '// MODIFIED CONTENT\n', 'utf8');
    expect(fs.readFileSync(filePath, 'utf8')).toBe('// MODIFIED CONTENT\n');

    // Restore
    const restoredCount = manager.restoreAll();
    expect(restoredCount).toBe(1);
    expect(fs.readFileSync(filePath, 'utf8')).toBe(originalContent);
    expect(manager.hasBackup()).toBe(false);
  });
});
