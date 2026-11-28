# Visual Mini Compiler

A React + TypeScript browser workbench for a Compiler Design course.

**Checkpoint 6:** lexical analysis, recursive-descent parsing, semantic analysis,
three-address intermediate code generation, an instruction runner, and .mcl file
handling are implemented. Open a .mcl file (or load an example), compile it and inspect
its tokens, AST, symbol table, and generated instructions; then press **Run** to execute
the instructions and see the printed output. Compiling never runs the program, and
**Download .mcl** saves your edited source as a file.

## Run

Node.js 20.19 or later is required; CI uses Node 22.

~~~sh
npm install
npm run dev
~~~

Open the local address printed by Vite, usually http://localhost:5173.

### Local startup on Windows

1. Install Node.js 22 LTS from https://nodejs.org (includes npm).
2. In Command Prompt: git clone https://github.com/salonipandey-dev/visual-mini-compiler.git,
   then cd visual-mini-compiler, npm install, and npm run dev.
3. Open http://localhost:5173 in Chrome, Edge, or Firefox. Stop the server with Ctrl+C.

### Five-minute demonstration

1. Use **Open .mcl** to open samples/marks.mcl from the cloned repository.
   The file bar shows marks.mcl and "No unsaved changes".
2. Press **Compile** (Ctrl+Enter). Show the Lexical tokens, the Syntax tree, the
   Semantic symbol table, and the Intermediate instructions.
3. Press **Run** (Ctrl+Shift+Enter). Output shows 75.
4. Add print marks; at the end. The file bar shows "Unsaved changes" and Run is disabled.
5. Choose an example from **Load an example**. The dialog offers Keep editing,
   Download a copy, or Replace without downloading. Choose **Download a copy**,
   then **Keep editing**, and open the downloaded file to show its contents.
6. Compile and Run again: Output shows 75 and 70.
7. Optional: open samples/undeclared.mcl to show a semantic error that keeps Run
   unavailable, or samples/limit.mcl to show a runtime limit error with partial output.

| Command | Purpose |
| --- | --- |
| npm test | Run compiler, runner, and file-handling tests and the rendering tests once |
| npm run test:watch | Re-run tests while editing |
| npm run typecheck | Check TypeScript types |
| npm run test:e2e | Run the Chromium workbench and file-workflow tests |
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
| src/files/ | Source document (revision vs baseline), UTF-8 file reading, downloads, stale-read guard |
| src/compiler/pipeline.ts | Ordered phases; later phases skip after failure |
| src/compiler/diagnostics.ts | Shared diagnostic representation |
| src/ui/ | Editor, file bar, replace dialog, token table, AST tree, symbol table, instructions, phase tabs, problems, output, error boundary |
| src/examples/ | Valid and invalid source examples |
| tests/ | Lexer, parser, semantic, code generation, runner, file-handling, pipeline, and rendering tests |
| tests/browser/ | Chromium workbench and file-workflow tests (Playwright) |
| samples/ | Example .mcl files for opening in the workbench |

The compiler core and the runtime import neither React nor the DOM; the compiler never imports the runtime. The workbench uses a dark
purple and peach theme whose colours are defined once as CSS custom properties at the
top of src/styles.css. Source edits invalidate the previous results by revision,
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

## Opening and downloading .mcl files

- **Open .mcl** uses the browser's standard file picker. The file must be UTF-8;
  invalid bytes are rejected, never replaced. A UTF-8 byte-order mark is removed
  and CRLF/CR become LF. Files over 1 MB are refused; anything smaller loads in
  full, and source over 5,000 characters loads too, with Compile reporting the limit.
  Source with language errors loads normally; Compile reports the errors.
- A canceled selection or a read error changes nothing: the editor, compilation,
  Run availability, and output stay as they were. Choosing the same file again works.
- A successful Open or Load Example replaces the source in one step, shows the new
  name, clears the old compilation, output, and selections, and always requires
  compiling again, even if the text is identical.
- **Download .mcl** saves the editor text as UTF-8 with LF newlines, named after
  the opened file (with a .mcl extension) or the example. The message says the
  download *started*: the browser never tells the page whether the file was saved.
  Downloading does not change the text, so a current compilation stays valid.

## Unsaved work

- The file bar compares the editor text with its baseline: the text of the last
  Open or Load Example. "Unsaved changes" clears only when the text matches the
  baseline again, after Open, Load Example, or an Undo back to it. A download
  never clears it; it shows "Unsaved: download started, not confirmed" instead.
- Before Open or Load Example would replace unsaved changes, a dialog offers
  **Keep editing** (or Escape), **Download a copy**, or **Replace without
  downloading**. Downloading a copy keeps the dialog open and the editor
  unchanged until you choose to keep editing or replace.
- Unsaved status and compilation validity are separate. Undo can clear the
  unsaved difference while the compilation stays stale until you compile again.
- While there are unsaved changes, the browser is asked to warn before reload or
  close. This is best effort; browsers decide whether and how to show it.

See [file-workflow.md](docs/file-workflow.md) for the state transitions and browser
decisions, and [acceptance-checklist.md](docs/acceptance-checklist.md) for the
manual checks.

## Data and verification

Source, compilation results, and run output live only in this tab's memory. The
page stores nothing: no server, cookies, or browser storage. Reloading, closing
the tab, or the browser discarding it loses unsaved work; only a downloaded file
you saved keeps it. Refreshing restores the default example. The symbol table and
instruction list never show runtime values: only Run produces output. The final
report and release packaging are later work.

GitHub Actions runs the test suite, TypeScript/production build, and Chromium
workbench smoke tests on pull requests and pushes to main. Test outcomes are reported by CI; this README does not
claim verification beyond what CI reports.

## GitHub Pages deployment

The Publish website workflow tests the compiler, builds the static application
for `/visual-mini-compiler/`, verifies production asset paths, and runs the Chromium
checks before uploading the site. Pull requests build and test without publishing.
Pushes to main and manual runs on main publish after those checks pass.

One-time repository setup: open Settings > Pages and select **GitHub Actions**
under Build and deployment > Source. The workflow cannot enable Pages itself.
If an earlier deployment failed because Pages was disabled, re-run its failed job
after enabling the setting, or run Publish website manually on main.

Expected address after a successful deployment:
https://salonipandey-dev.github.io/visual-mini-compiler/

Only a successful deployment confirms that this address is live. The source and
compiler run locally in the visitor's browser; hosting serves the static application.
