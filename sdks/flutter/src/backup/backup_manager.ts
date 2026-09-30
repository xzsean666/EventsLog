import * as fs from 'fs';
import * as path from 'path';

export interface BackupManifest {
  timestamp: string;
  files: Array<{
    relativePath: string;
    originalSize: number;
  }>;
  createdFiles?: string[];
}

export class BackupManager {
  readonly backupDir: string;
  readonly manifestPath: string;
  private manifest: BackupManifest;

  constructor(readonly projectRoot: string) {
    this.backupDir = path.join(projectRoot, '.eventslog_backup');
    this.manifestPath = path.join(this.backupDir, 'manifest.json');
    this.manifest = {
      timestamp: new Date().toISOString(),
      files: [],
      createdFiles: [],
    };
  }

  hasBackup(): boolean {
    return fs.existsSync(this.manifestPath);
  }

  /**
   * Tracks a new file created by instrumentation (will be deleted on restore).
   */
  trackCreatedFile(relativeFilePath: string): void {
    const rel = relativeFilePath.replace(/\\/g, '/');
    if (!this.manifest.createdFiles) {
      this.manifest.createdFiles = [];
    }
    if (!this.manifest.createdFiles.includes(rel)) {
      this.manifest.createdFiles.push(rel);
    }
  }

  /**
   * Backs up a single file before it is modified.
   */
  backupFile(relativeFilePath: string): void {
    const srcPath = path.join(this.projectRoot, relativeFilePath);
    if (!fs.existsSync(srcPath)) return;

    const destPath = path.join(this.backupDir, relativeFilePath);
    if (fs.existsSync(destPath)) {
      // Pristine original already backed up; never overwrite!
      return;
    }
    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    const content = fs.readFileSync(srcPath);
    fs.writeFileSync(destPath, content);

    this.manifest.files.push({
      relativePath: relativeFilePath.replace(/\\/g, '/'),
      originalSize: content.length,
    });
  }

  /**
   * Writes the backup manifest file to disk.
   */
  saveManifest(): void {
    fs.mkdirSync(this.backupDir, { recursive: true });
    fs.writeFileSync(this.manifestPath, JSON.stringify(this.manifest, null, 2), 'utf8');
  }

  /**
   * Restores all previously backed-up files and removes the backup directory.
   */
  restoreAll(): number {
    if (!this.hasBackup()) {
      return 0;
    }

    try {
      const raw = fs.readFileSync(this.manifestPath, 'utf8');
      const manifest = JSON.parse(raw) as BackupManifest;
      let count = 0;

      for (const item of manifest.files) {
        const backupFilePath = path.join(this.backupDir, item.relativePath);
        const originalFilePath = path.join(this.projectRoot, item.relativePath);

        if (fs.existsSync(backupFilePath)) {
          fs.mkdirSync(path.dirname(originalFilePath), { recursive: true });
          fs.copyFileSync(backupFilePath, originalFilePath);
          count++;
        }
      }

      // Remove created files
      if (manifest.createdFiles) {
        for (const rel of manifest.createdFiles) {
          const target = path.join(this.projectRoot, rel);
          if (fs.existsSync(target)) {
            fs.rmSync(target, { force: true });
          }
        }
      }

      // Clean up backup directory
      fs.rmSync(this.backupDir, { recursive: true, force: true });
      return count;
    } catch (err) {
      throw new Error(`Failed to restore backup: ${String(err)}`);
    }
  }

  /**
   * Gets current backup status.
   */
  getStatus(): { hasBackup: boolean; filesCount: number; timestamp?: string } {
    if (!this.hasBackup()) {
      return { hasBackup: false, filesCount: 0 };
    }
    try {
      const raw = fs.readFileSync(this.manifestPath, 'utf8');
      const manifest = JSON.parse(raw) as BackupManifest;
      return {
        hasBackup: true,
        filesCount: manifest.files.length,
        timestamp: manifest.timestamp,
      };
    } catch {
      return { hasBackup: true, filesCount: 0 };
    }
  }
}
