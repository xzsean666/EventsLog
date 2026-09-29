# EventsLog Flutter Example Application

Demonstrates zero-code function observability using `eventslog.yaml` and the AST CLI.

## How to Test Instrumentation

```bash
# From repository root or within this directory:
node ../../sdks/flutter/dist/cli.js inject --dir .

# Inspect status:
node ../../sdks/flutter/dist/cli.js status --dir .

# Revert back to original clean code:
node ../../sdks/flutter/dist/cli.js restore --dir .
```
