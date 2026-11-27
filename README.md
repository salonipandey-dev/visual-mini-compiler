# Visual Mini Compiler

A React + TypeScript browser workbench for a Compiler Design course.

**Checkpoint 3:** lexical analysis, recursive-descent parsing, and semantic analysis
are implemented. Compile a small integer-language program and inspect its tokens,
its real AST, and its symbol table. Execution and intermediate code are later
checkpoints: a successful compilation means the program was checked, not run,
so no printed output or variable values are shown.

## Run

Node.js 20.19 or later is required; CI uses Node 22.

~~~sh
npm install
npm run dev
~~~

Open the local address printed by Vite, usually http://localhost:5173.

| Command | Purpose |
| --- | --- |
| npm test | Run compiler, AST and symbol-table rendering tests once |
| npm run test:watch | Re-run tests while editing |
| npm run typecheck | Check TypeScript types |
| npm run test:e2e | Run the Chromium workbench smoke tests |
| npm run build | Type-check and build the production site into dist/ |
| npm run preview | Serve the production build |

For the browser tests, install Chromium once with npx playwright install chromium.
On Windows PowerShell, use npm.cmd/npx.cmd if npm.ps1 or npx.ps1 is blocked.
This avoids changing the PowerShell execution policy.

## Language

~~~text
# A simple integer program
let marks = 70;
let bonus = 5;
print marks + bonus;
~~~

The lexer recognizes let/print, ASCII identifiers, decimal integer literals,
+ - * =, parentheses, and semicolons. Comments begin with #. Unary minus and
parentheses are supported.

Semantic rules: one global scope, case-sensitive names, every variable declared
once with let, and declared before it is used. A declaration's initializer is
checked before its name exists, so let total = total + 1; is an error.
The Semantic tab lists each variable's name, type (integer), and declaration position.

Precedence: unary minus, then multiplication, then addition/subtraction.
Binary operations associate to the left. print(7); is a print statement with
a parenthesized expression.

The earlier assumed C-like vocabulary has been replaced by the documented .mcl
language. Floats, booleans, conditions, loops, division, reassignment, and C-style
comments are outside version 1.

See the [language specification](docs/language-spec.md), the
[parser walkthrough](docs/parser-walkthrough.md), and the
[semantic analysis walkthrough](docs/semantic-walkthrough.md).

## Structure

| Location | Responsibility |
| --- | --- |
| src/compiler/source.ts | Newline normalization and resource limits |
| src/compiler/token.ts | Token records and vocabulary |
| src/compiler/lexer.ts | Source to tokens and lexical diagnostics |
| src/compiler/ast.ts | Typed AST records and source spans |
| src/compiler/parser.ts | Recursive-descent grammar and depth checks |
| src/compiler/semantic.ts | AST walk, Map-based symbol table, name checks |
| src/compiler/pipeline.ts | Ordered phases; later phases skip after failure |
| src/compiler/diagnostics.ts | Shared diagnostic representation |
| src/ui/ | Editor, token table, AST tree, symbol table, phase tabs, problems |
| src/examples/ | Valid and invalid source examples |
| tests/ | Lexer, parser, semantic, pipeline, and rendering tests |
| tests/browser/ | Chromium workbench tests (Playwright) |

The compiler core imports neither React nor the DOM. The workbench uses the
existing mocha palette. Source edits invalidate the previous results by revision,
including an edit followed by Undo. Stale results are labeled and their source
navigation/highlights are disabled.

## Limits and positions

- Source is normalized from CRLF or CR to LF.
- Maximum 5,000 Unicode characters after normalization.
- Maximum 100 digits per integer literal.
- Maximum 50 active parenthesized/unary nesting levels.
- Maximum expression operator depth 50.
- Lines and columns start at 1; tabs count as one column.
- Offsets/selection lengths use UTF-16 units for the browser editor.
- Integers in the AST are exact canonical decimal strings, avoiding Number rounding.

Lexing stops at its first error. Parsing runs only after successful tokenization.
The parser reports the first syntax failure with expected/found details.
Semantic analysis runs only on a complete AST and reports its first error;
the declarations accepted before it are shown as a partial symbol table.
The AST includes grouping nodes for display, while preserving the exact identifier
and operator positions. Grouping does not add to operator depth.

## Data and verification

Source and results live in browser memory. Refreshing restores the default example;
no source is sent to a server or persisted. No program execution is implemented yet,
so the symbol table never shows runtime values.

GitHub Actions runs the test suite, TypeScript/production build, and Chromium
workbench smoke tests on pull requests and pushes to main. Test outcomes are reported by CI; this README does not
claim verification of future compiler phases.
