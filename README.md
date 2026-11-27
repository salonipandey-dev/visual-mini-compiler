# Visual Mini Compiler

A React + TypeScript browser workbench for a Compiler Design course.

**Checkpoint 5:** lexical analysis, recursive-descent parsing, semantic analysis,
three-address intermediate code generation, and an instruction runner are implemented.
Compile a small integer-language program and inspect its tokens, AST, symbol table,
and generated instructions; then press **Run** to execute the instructions and see
the printed output. Compiling never runs the program: Run is a separate step.

## Run

Node.js 20.19 or later is required; CI uses Node 22.

~~~sh
npm install
npm run dev
~~~

Open the local address printed by Vite, usually http://localhost:5173.

| Command | Purpose |
| --- | --- |
| npm test | Run compiler tests and AST, symbol-table, and instruction rendering tests once |
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

## Intermediate code

After every check passes, the AST is translated into typed three-address instructions:

~~~text
let marks = 70;          marks = 70
let bonus = 5;           bonus = 5
print marks + bonus;     %t1 = marks + bonus
                         PRINT %t1
~~~

Opcodes are COPY, ADD, SUB, MUL, NEG, and PRINT. Operands are tagged as exact
integer literals, source variables, or compiler temporaries (%t1, %t2...), so a
variable named t1 never collides with temporary %t1. Temporaries restart at %t1
on every compilation. Generation does not evaluate or fold anything.

## Running a program

Press **Run** (or Ctrl+Shift+Enter) after a successful compilation. The runner in
src/runtime/ executes the instruction objects in order with exact BigInt arithmetic:

~~~text
marks = 70           variables: marks -> 70
bonus = 5            variables: bonus -> 5
%t1 = marks + bonus  temporaries: %t1 -> 75
PRINT %t1            output: 75
~~~

- Run is enabled only when the latest compilation succeeded, including code
  generation, and was made from the editor's current text. Any edit, even one
  followed by Undo, requires compiling again. The Run handler re-checks this.
- Every run starts with empty variables, temporaries, and output, and replaces
  the previous output. An empty program runs successfully and prints nothing.
- Every value must have an absolute value below 10^100. Each arithmetic result is
  checked before it is stored; an oversized intermediate result stops the run with
  a runtime error at that operator, and earlier output is shown as partial output.
- Runtime errors appear under Output, separate from compile Problems.

Precedence: unary minus, then multiplication, then addition/subtraction.
Binary operations associate to the left. print(7); is a print statement with
a parenthesized expression.

The earlier assumed C-like vocabulary has been replaced by the documented .mcl
language. Floats, booleans, conditions, loops, division, reassignment, and C-style
comments are outside version 1.

See the [language specification](docs/language-spec.md), the
[parser walkthrough](docs/parser-walkthrough.md), the
[semantic analysis walkthrough](docs/semantic-walkthrough.md), the
[intermediate code walkthrough](docs/ir-walkthrough.md), and the
[runtime walkthrough](docs/runtime-walkthrough.md).

## Structure

| Location | Responsibility |
| --- | --- |
| src/compiler/source.ts | Newline normalization and resource limits |
| src/compiler/token.ts | Token records and vocabulary |
| src/compiler/lexer.ts | Source to tokens and lexical diagnostics |
| src/compiler/ast.ts | Typed AST records and source spans |
| src/compiler/parser.ts | Recursive-descent grammar and depth checks |
| src/compiler/semantic.ts | AST walk, Map-based symbol table, name checks |
| src/compiler/ir.ts | Typed three-address instructions and tagged operands |
| src/compiler/codegen.ts | AST-to-instruction generation and temporaries |
| src/compiler/ir-format.ts | Readable text for instructions (display only) |
| src/runtime/runner.ts | Executes instructions with BigInt and the 10^100 limit |
| src/runtime/index.ts | Runtime API and the runnable-compilation check |
| src/compiler/pipeline.ts | Ordered phases; later phases skip after failure |
| src/compiler/diagnostics.ts | Shared diagnostic representation |
| src/ui/ | Editor, token table, AST tree, symbol table, instructions, phase tabs, problems, output, error boundary |
| src/examples/ | Valid and invalid source examples |
| tests/ | Lexer, parser, semantic, code generation, runner, pipeline, and rendering tests |
| tests/browser/ | Chromium workbench tests (Playwright) |

The compiler core and the runtime import neither React nor the DOM; the compiler never imports the runtime. The workbench uses the
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
Code generation runs only after all three analyses succeed. Otherwise it is
skipped and no instructions exist for that compilation.
The AST includes grouping nodes for display, while preserving the exact identifier
and operator positions. Grouping does not add to operator depth.

## Data and verification

Source, compilation results, and run output live in browser memory. Refreshing
restores the default example; no source is sent to a server or persisted. The
symbol table and instruction list never show runtime values: only Run produces output.
File import/export, packaging, and the project report are later work.

GitHub Actions runs the test suite, TypeScript/production build, and Chromium
workbench smoke tests on pull requests and pushes to main. Test outcomes are reported by CI; this README does not
claim verification beyond what CI reports.
