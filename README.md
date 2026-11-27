# Visual Mini Compiler

A React + TypeScript browser workbench for a Compiler Design course.

**Checkpoint 2:** lexical analysis and recursive-descent parsing are implemented.
Compile a small integer-language program and inspect its tokens and real AST.
Semantic checks, intermediate instructions, and execution are later checkpoints;
a successful parse does not establish that variables are declared or produce printed output.

## Run

Node.js 20.19 or later is required; CI uses Node 22.

~~~sh
npm install
npm run dev
~~~

Open the local address printed by Vite, usually http://localhost:5173.

| Command | Purpose |
| --- | --- |
| npm test | Run compiler and AST-rendering tests once |
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
parentheses are supported. Variables are declared once using let; checks for
undeclared names and duplicate declarations belong to the upcoming semantic phase.

Precedence: unary minus, then multiplication, then addition/subtraction.
Binary operations associate to the left. print(7); is a print statement with
a parenthesized expression.

The earlier assumed C-like vocabulary has been replaced by the documented .mcl
language. Floats, booleans, conditions, loops, division, reassignment, and C-style
comments are outside version 1.

See [language specification](docs/language-spec.md) and
[parser walkthrough](docs/parser-walkthrough.md).

## Structure

| Location | Responsibility |
| --- | --- |
| src/compiler/source.ts | Newline normalization and resource limits |
| src/compiler/token.ts | Token records and vocabulary |
| src/compiler/lexer.ts | Source to tokens and lexical diagnostics |
| src/compiler/ast.ts | Typed AST records and source spans |
| src/compiler/parser.ts | Recursive-descent grammar and depth checks |
| src/compiler/pipeline.ts | Ordered phases; later phases skip after failure |
| src/compiler/diagnostics.ts | Shared diagnostic representation |
| src/ui/ | Editor, token table, AST tree, phase tabs, problems |
| src/examples/ | Valid and invalid source examples |
| tests/ | Language, parser, pipeline, and rendering tests |

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
The AST includes grouping nodes for display, while preserving the exact identifier
and operator positions. Grouping does not add to operator depth.

## Data and verification

Source and results live in browser memory. Refreshing restores the default example;
no source is sent to a server or persisted. No program execution is implemented yet.

GitHub Actions runs the test suite, TypeScript/production build, and Chromium
workbench smoke tests on pull requests and pushes to main. Test outcomes are reported by CI; this README does not
claim verification of future compiler phases.
