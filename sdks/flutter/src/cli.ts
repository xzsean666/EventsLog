import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { loadConfig } from './config/loader.js';
import { PatternMatcher } from './matcher/matcher.js';
import { transformDartSource } from './transformer/rewriter.js';
import { BackupManager } from './backup/backup_manager.js';

function walkDir(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.eventslog_backup' && entry.name !== '.git') {
        walkDir(fullPath, fileList);
      }
    } else if (entry.isFile() && entry.name.endsWith('.dart')) {
      fileList.push(fullPath);
    }
  }

  return fileList;
}

export function runInject(projectDir?: string, configPath?: string): { filesModified: number; functionsCount: number } {
  const config = loadConfig(projectDir, configPath);
  const matcher = new PatternMatcher(config.include, config.exclude);
  const backupManager = new BackupManager(config.projectRoot);

  if (backupManager.hasBackup()) {
    console.log('[EventsLog] Previous backup detected in .eventslog_backup/. Restoring first...');
    backupManager.restoreAll();
  }

  const allDartFiles = walkDir(config.projectRoot);
  let filesModified = 0;
  let functionsCount = 0;

  for (const absPath of allDartFiles) {
    const relPath = path.relative(config.projectRoot, absPath).replace(/\\/g, '/');

    if (!matcher.matchesFile(relPath)) {
      continue;
    }

    const source = fs.readFileSync(absPath, 'utf8');
    const res = transformDartSource(source, relPath, config, matcher);

    if (res.modified) {
      backupManager.backupFile(relPath);
      fs.writeFileSync(absPath, res.code, 'utf8');
      filesModified++;
      functionsCount += res.instrumentedFunctions.length;
      console.log(`[EventsLog] Instrumented ${relPath} (${res.instrumentedFunctions.length} functions)`);
    }
  }

  if (filesModified > 0) {
    const libDir = path.join(config.projectRoot, 'lib');
    if (fs.existsSync(libDir)) {
      const bootstrapRel = 'lib/.eventslog_bootstrap.g.dart';
      const bootstrapAbs = path.join(config.projectRoot, bootstrapRel);
      const headersStr = config.headers ? JSON.stringify(config.headers) : 'null';
      const bootstrapCode = `// @eventslog:generated
// Auto-generated configuration bootstrap by EventsLog CLI. Do not commit.
import 'package:eventslog_flutter/eventslog.dart';

const EventsLogConfig kEventsLogAutoConfig = EventsLogConfig(
  serviceName: '${config.serviceName}',
  environment: '${config.environment}',
  endpoint: '${config.endpoint}',
  batchSize: ${config.batchSize},
  flushIntervalMs: ${config.flushIntervalMs},
  maxQueueSize: ${config.maxQueueSize},
  captureArguments: ${config.captureArguments},
  captureReturns: ${config.captureReturns},
  headers: ${headersStr},
);

/// Auto-registers default configuration at app startup.
void ensureEventsLogConfigured() {
  EventsLog.defaultConfig = kEventsLogAutoConfig;
  if (!EventsLog.isInitialized) {
    EventsLog.init(kEventsLogAutoConfig);
  }
}
`;
      fs.writeFileSync(bootstrapAbs, bootstrapCode, 'utf8');
      backupManager.trackCreatedFile(bootstrapRel);

      const mainAbs = path.join(config.projectRoot, 'lib/main.dart');
      if (fs.existsSync(mainAbs)) {
        const mainSource = fs.readFileSync(mainAbs, 'utf8');
        if (!mainSource.includes('ensureEventsLogConfigured') && !mainSource.includes('.eventslog_bootstrap.g.dart')) {
          const mainRegex = /((?:void|Future<void>)?\s*main\s*\([^)]*\)\s*(?:async)?\s*\{)/;
          if (mainRegex.test(mainSource)) {
            backupManager.backupFile('lib/main.dart');
            let newMain = `import '.eventslog_bootstrap.g.dart';\n` + mainSource;
            newMain = newMain.replace(mainRegex, '$1\n  ensureEventsLogConfigured();');
            fs.writeFileSync(mainAbs, newMain, 'utf8');
            console.log('[EventsLog] Injected runtime auto-configuration hook into lib/main.dart');
          }
        }
      }
    }

    backupManager.saveManifest();
    console.log(`[EventsLog] Successfully instrumented ${filesModified} files (${functionsCount} functions).`);
    console.log(`[EventsLog] Original sources backed up to .eventslog_backup/`);
  } else {
    console.log('[EventsLog] No matching files or functions found to instrument.');
  }

  return { filesModified, functionsCount };
}

export function runRestore(projectDir?: string): number {
  const config = loadConfig(projectDir);
  const backupManager = new BackupManager(config.projectRoot);

  if (!backupManager.hasBackup()) {
    console.log('[EventsLog] No active backup found. Project is already in clean state.');
    return 0;
  }

  const count = backupManager.restoreAll();
  console.log(`[EventsLog] Cleanly restored ${count} files. Backup removed.`);
  return count;
}

export function printStatus(projectDir?: string): void {
  const config = loadConfig(projectDir);
  const backupManager = new BackupManager(config.projectRoot);
  const status = backupManager.getStatus();

  console.log(`[EventsLog] Project Root: ${config.projectRoot}`);
  console.log(`[EventsLog] Service Name: ${config.serviceName}`);
  console.log(`[EventsLog] Environment:  ${config.environment}`);
  console.log(`[EventsLog] Status:        ${status.hasBackup ? 'INSTRUMENTED (Active)' : 'CLEAN (Not instrumented)'}`);
  if (status.hasBackup) {
    console.log(`[EventsLog] Modified:      ${status.filesCount} files (at ${status.timestamp})`);
  }
}

export async function runWithLifecycle(
  cmd: string,
  args: string[],
  projectDir?: string,
  configPath?: string,
): Promise<number> {
  const config = loadConfig(projectDir, configPath);
  const backupManager = new BackupManager(config.projectRoot);

  console.log(`[EventsLog] Pre-build step: Injecting observability hooks...`);
  runInject(projectDir, configPath);

  let restored = false;
  const restoreOnce = () => {
    if (!restored) {
      restored = true;
      console.log(`\n[EventsLog] Post-build step: Restoring original sources...`);
      runRestore(projectDir);
    }
  };

  process.on('SIGINT', () => {
    restoreOnce();
    process.exit(130);
  });

  process.on('SIGTERM', () => {
    restoreOnce();
    process.exit(143);
  });

  process.on('exit', () => {
    restoreOnce();
  });

  return new Promise<number>((resolve) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      shell: true,
      cwd: config.projectRoot,
    });

    child.on('close', (code) => {
      restoreOnce();
      resolve(code ?? 0);
    });

    child.on('error', (err) => {
      console.error(`[EventsLog] Child process error: ${err.message}`);
      restoreOnce();
      resolve(1);
    });
  });
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const command = argv[0];

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    console.log(`
EventsLog Flutter/Dart AST Instrumentation CLI

Usage:
  eventslog-flutter <command> [options]

Commands:
  inject                Instrument Flutter/Dart files based on eventslog.yaml and backup originals
  restore               Restore original files from .eventslog_backup/ (reverts instrumentation)
  run -- <cmd...>       Wrap execution (inject -> run command -> restore original files)
  status                Show current instrumentation status

Options:
  --config <path>       Specify custom path to eventslog.yaml
  --dir <path>          Target Flutter project directory (defaults to current working directory)
  -h, --help            Show this help message
`);
    return;
  }

  let projectDir: string | undefined = undefined;
  let configPath: string | undefined = undefined;

  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--dir' && argv[i + 1]) {
      projectDir = argv[++i];
    } else if (argv[i] === '--config' && argv[i + 1]) {
      configPath = argv[++i];
    }
  }

  switch (command) {
    case 'inject':
    case 'instrument':
      runInject(projectDir, configPath);
      break;

    case 'restore':
    case 'revert':
    case 'clean':
      runRestore(projectDir);
      break;

    case 'status':
      printStatus(projectDir);
      break;

    case 'run': {
      const dashDashIndex = argv.indexOf('--');
      if (dashDashIndex === -1 || dashDashIndex === argv.length - 1) {
        console.error('[EventsLog] Error: "run" command requires target command after "--", e.g.:');
        console.error('  eventslog-flutter run -- flutter build apk');
        process.exit(1);
      }
      const targetCmdArgs = argv.slice(dashDashIndex + 1);
      const cmd = targetCmdArgs[0];
      const args = targetCmdArgs.slice(1);
      const exitCode = await runWithLifecycle(cmd, args, projectDir, configPath);
      process.exit(exitCode);
    }

    default:
      console.error(`[EventsLog] Unknown command: "${command}". Run with --help for usage.`);
      process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test' && (process.argv[1]?.endsWith('cli.ts') || process.argv[1]?.endsWith('cli.js'))) {
  main().catch((err) => {
    console.error(`[EventsLog] Fatal CLI error: ${err.message}`);
    process.exit(1);
  });
}
