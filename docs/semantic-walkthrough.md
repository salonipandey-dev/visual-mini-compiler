# Checkpoint 3: semantic analysis walkthrough

## What changed

The Semantic tab now shows real output: a symbol table built by walking the
parser's AST, plus diagnostics for undeclared names and duplicate declarations.
The analyzer lives in src/compiler/semantic.ts and, like the rest of the
compiler core, imports neither React nor any browser API.

Semantic analysis checks the program's names. It does not evaluate expressions,
so the symbol table records where each variable is declared and its type, never a value.
A successful compilation means the program was checked, not that it ran.

## How the AST reaches the analyzer

compile() in src/compiler/pipeline.ts runs the phases in order:

~~~text
source -> tokenize() -> tokens -> parse() -> Program AST -> analyze() -> symbol table + diagnostics
~~~

analyze() runs only when input validation, lexing, and parsing all succeeded,
because it needs a complete AST. After any earlier failure the semantic phase is
marked skipped and produces no output or diagnostics.

The analyzer receives the same frozen Program object the Syntax tab displays.
It only reads it: it never re-tokenizes or re-parses the source, and never
changes a node. Symbol positions reuse the AST's own nameSpan objects.

## How symbols are stored

Each analysis creates a new SemanticAnalyzer with an empty Map<string, SymbolEntry>.

- A Map keeps insertion order, so the table is listed in declaration order.
- A Map treats every key as plain data. On a {} object, names such as __proto__
  or constructor would collide with built-in properties; here
  `print constructor;` is correctly undeclared and `let __proto__ = 1;` is an ordinary symbol.
- Nothing is shared between compilations, so a name declared in one run can
  never leak into the next.

Each entry holds name, type (always integer in .mcl version 1), and declaredAt,
the span of the name in its let statement.

## The traversal, in source order

For each statement, top to bottom:

1. let name = initializer;
   1. If name is already in the Map, report duplicate-declaration at this name.
   2. Check the initializer expression.
   3. Only then add name to the Map.
2. print expression; checks the expression.

Expressions are visited left to right: a binary node checks its left side before
its right, and unary and grouping nodes check their single child. An identifier
must already be in the Map; otherwise it is reported as undeclared-variable.

Like the lexer and parser, the analyzer stops at the first error. Declarations
checked before that point are still returned, marked complete: false, and the
workbench labels them a "Partial symbol table".

## Why the initializer is checked before the name is declared

~~~text
let total = total + 1;
~~~

The initializer describes the starting value of total, so it may only use names
that already exist. If total were added to the Map first, the initializer would
refer to a variable with no value yet. Checking the initializer first makes the
inner total undeclared, reported at line 1, column 13.

The message also explains why a name is unavailable:

| Source | Message |
| --- | --- |
| print missing; | Undeclared variable 'missing'. |
| print rate;  then let rate = 5; | Variable 'rate' is used before its declaration at line 2, column 5. |
| let total = total + 1; | Variable 'total' is used in its own initializer. ... |
| let score = 10; let score = 20; | Variable 'score' is already declared at line 1, column 5. |

## How diagnostics reach the editor

A semantic Diagnostic has the same shape as lexical and syntax diagnostics:
phase, severity, code, message, line, column, UTF-16 offset and length, and
expected/found text. The pipeline appends it to CompileResult.diagnostics, so:

- the Problems panel lists it with a Semantic label;
- the editor underlines the exact name and marks its line in the gutter;
- choosing the problem selects that name in the editor;
- choosing a row in the symbol table highlights the declaration.

Any edit, including an edit followed by Undo, makes the results stale.
Stale results stay visible but their highlights and source links are disabled until you compile again.

## Phases still unfinished

- Execution of print statements with exact BigInt arithmetic and the 10^100 limit.
- Optimization and machine code generation.

Intermediate code generation was added in checkpoint 4; see
[ir-walkthrough.md](ir-walkthrough.md).

## Understanding checkpoint

1. Why would a {} object be unsafe for a symbol table that may contain __proto__?
2. In `let x = 1; let x = y;`, why is the duplicate reported instead of y?
3. Why can the Semantic tab show a successful result even though nothing printed?
