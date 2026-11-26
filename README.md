# Visual Mini Compiler

A browser workbench for a Compiler Design course. Type a program in a small C-like
language, press **Compile**, and inspect the real output of each compiler phase.

**Status: checkpoint 1 of N.** Lexical analysis is complete. Syntax and semantic
analysis show "Not built yet" until their checkpoints.

## Run it on Windows

Needs Node.js 20.19+ (22 LTS or newer recommended), from https://nodejs.org.

```bat
cd visual-mini-compiler
npm install
npm run dev
```

Open the address it prints (usually http://localhost:5173).

| Command | What it does |
| --- | --- |
| `npm test` | Runs the compiler unit tests once (Vitest, no browser needed) |
| `npm run test:watch` | Re-runs the tests whenever you save a file |
| `npm run typecheck` | Checks all TypeScript types |
| `npm run build` | Type-checks, then builds the production site into `dist/` |
| `npm run preview` | Serves the built `dist/` folder |

If PowerShell says *"running scripts is disabled on this system"*, use Command
Prompt instead, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.

## Project layout

```
src/
  compiler/          the compiler core: plain TypeScript, no React, no DOM
    diagnostics.ts   the one Diagnostic shape every phase reports errors with
    token.ts         token types + the language's keywords, operators, delimiters
    lexer.ts         phase 1: source text -> tokens + diagnostics
    pipeline.ts      compile(): runs the phases in order, skips after an error
    index.ts         the only file the UI imports from
  examples/          sample programs (valid and invalid) for the Examples menu
  ui/                React components: editor, phase pipeline, token table, problems
  App.tsx            state + wiring: editor text -> compile() -> panels
  styles.css         the workbench theme
tests/               unit tests for the compiler core and every example program
```

## Where data lives

Everything runs in your browser. The source text and results are held in memory
(React state); nothing is saved or sent to a server. Refreshing the page restores
the default example and clears all results.

## Language (assumed until the Language Specification is supplied)

| Token type | Rule | Examples |
| --- | --- | --- |
| `KEYWORD` | `int float bool if else while print` | `while` |
| `BOOL_LITERAL` | `true false` | `true` |
| `IDENTIFIER` | letter or `_`, then letters, digits, `_` (ASCII) | `total`, `_tmp1` |
| `INT_LITERAL` | one or more digits | `42` |
| `FLOAT_LITERAL` | digits `.` digits | `3.14` |
| `OPERATOR` | `+ - * / % = == != < <= > >= && \|\| !` | `<=` |
| `DELIMITER` | `( ) { } ; ,` | `;` |

Whitespace and comments (`// line` and `/* block */`) are skipped. Lines and
columns start at 1; a tab counts as one column; Windows `\r\n` line endings
give the same positions as `\n`.

Lexical errors: illegal characters (`@`, `#`, smart quotes...), a single `&` or
`|`, malformed numbers (`12.`, `3.14.15`), names starting with a digit (`9lives`),
and unterminated `/*` comments. The lexer reports every error in one pass.
