import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runInject, runRestore } from '../src/cli.js';

describe('CLI Workflow', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eventslog-flutter-cli-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs inject and restore end-to-end', () => {
    // 1. Create a dummy Flutter project structure
    fs.writeFileSync(
      path.join(tmpDir, 'pubspec.yaml'),
      'name: demo_flutter_app\nversion: 1.0.0\n',
      'utf8',
    );

    const configYaml = `
eventslog:
  service_name: "demo-flutter"
  include:
    - "lib/**"
  exclude:
    - "*_test.dart"
`;
    fs.writeFileSync(path.join(tmpDir, 'eventslog.yaml'), configYaml, 'utf8');

    const libServices = path.join(tmpDir, 'lib', 'services');
    fs.mkdirSync(libServices, { recursive: true });

    const originalDart = `
class PaymentService {
  Future<bool> processPayment(String orderId, double amount) async {
    return true;
  }
}
`;
    const dartPath = path.join(libServices, 'payment_service.dart');
    fs.writeFileSync(dartPath, originalDart, 'utf8');

    // 2. Run Inject
    const injectResult = runInject(tmpDir);
    expect(injectResult.filesModified).toBe(1);
    expect(injectResult.functionsCount).toBe(1);

    const injectedDart = fs.readFileSync(dartPath, 'utf8');
    expect(injectedDart).toContain('// @eventslog:instrumented');
    expect(injectedDart).toContain("functionName: 'PaymentService.processPayment'");
    expect(injectedDart).toContain("'orderId': orderId, 'amount': amount");

    // Verify backup exists
    expect(fs.existsSync(path.join(tmpDir, '.eventslog_backup'))).toBe(true);

    // 3. Run Restore
    const restoredCount = runRestore(tmpDir);
    expect(restoredCount).toBe(1);

    const restoredDart = fs.readFileSync(dartPath, 'utf8');
    expect(restoredDart).toBe(originalDart);
    expect(fs.existsSync(path.join(tmpDir, '.eventslog_backup'))).toBe(false);
  });
});
