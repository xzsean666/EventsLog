# Project Rules for AI Agents

All engineering AI agents working in this repository must strictly follow these rules.

## 1. Documentation & Sources of Truth
The following files are the sources of truth for project work:
- Project Rules: `AGENTS.md`
- Overall Goal: `docs/AI/GOAL.md`
- Task Index: `docs/AI/TASK_INDEX.md`
- Current Session State: `docs/AI/SESSION_STATE.md`
- Current Task Specification: `docs/AI/tasks/TASK-xxx.md`
- System Architecture: `docs/AI/ARCHITECTURE.md`
- Architectural Decisions: `docs/AI/DECISIONS.md`

## 2. Working Principles
1. Work on only ONE Goal and ONE current Task at a time.
2. A single session should by default complete at most ONE Task.
3. Never implement features outside the current Task.
4. Do not modify files unrelated to the task.
5. Never delete, overwrite, or roll back existing user changes.
6. Do not perform destructive operations (reset, checkout, recursive delete, etc.).
7. Do not proactively commit, push, release, or alter production environments.
8. Do not add dependencies unless explicitly required by the Task and existing dependencies cannot satisfy the need.
9. Do not assume tools or frameworks without verifying actual project files.
10. All conclusions must be based on actual file reads or actual command execution results.
11. Tests that have not been executed must never be claimed as passed.
12. When extra work is discovered, create a new Task; do not implement it immediately.

## 3. Startup Procedure
Every session must execute in order:
1. Confirm current working directory is project root.
2. Check repository status (`git status --short`).
3. Read project rules (`AGENTS.md`).
4. Read `GOAL.md`, `TASK_INDEX.md`, and `SESSION_STATE.md`.
5. Read current Task file and directly related source code, tests, and configuration.
6. Check that all dependencies of the current Task are completed.
7. If there was an `IN_PROGRESS` Task from last session, resume it first.
8. Otherwise, select the first `TODO` Task whose dependencies are satisfied.
9. Verify current repo state matches assumptions of the Task.
10. Output execution plan before modifying any code.

## 4. Task State Machine
`TODO` -> `IN_PROGRESS` -> `REVIEW` -> `DONE`
                       \-> `BLOCKED`

## 5. Pre-Modification Plan Format
Before modifying code, the agent must output:
```text
Request Type:
Goal:
Current Behavior:
Current Task:
Dependencies:
Files To Read:
Files To Modify:
Files To Create:
Implementation Approach:
Acceptance Criteria:
Verification Method:
Risks and Assumptions:
```

## 6. Implementation Rules
- Follow existing project conventions for naming, directory structure, error handling, logging, and testing.
- Maintain clear data flow; avoid implicit global state.
- Keep module interfaces explicit; do not access private internals of other modules.
- Keep dependency direction clean; avoid circular dependencies.
- Separate business logic, infrastructure, interface layer, and presentation layer.
- Pass configuration via explicit arguments or configuration objects.
- Do not add abstractions for speculative future use.
- Do not perform unrelated refactoring, batch formatting, or file moving.
- Keep changes minimal, reviewable, and reversible.
- Add focused tests for any changed behavior.
- Preserve backward compatibility unless the Task explicitly requires a breaking change.

## 7. Verification Rules
- Run the narrowest relevant tests first.
- Run typecheck, linting, or builds according to risk.
- Check final diff and repository status.
- Report only commands that were actually run and their real outputs.

## 8. Cross-Session Handover
Update `docs/AI/SESSION_STATE.md` before ending session, and output the required final summary:
```text
Goal:
Task:
Status: DONE | BLOCKED | REVIEW

Changed Files:
Created Files:

Implementation Summary:

Verification and Test Results:

Known Issues:

Remaining Work:

Next Task:
```
