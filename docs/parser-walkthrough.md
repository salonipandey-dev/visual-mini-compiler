# Checkpoint 2: parser and AST walkthrough

## What changed

The web workbench now follows the small .mcl language from the SRS. Its core
separates input normalization, tokenization, parsing, and phase coordination.
The mocha styling remains in place; Syntax now displays an actual AST.

## Follow one expression

For print 2 + 3 * 4;:

1. The lexer produces print, 2, +, 3, *, 4, ;, and EOF tokens.
2. The parser sees print and requests an expression.
3. The first term is the integer 2.
4. Addition consumes another term. That term consumes 3 * 4, since term handles multiplication.
5. The AST root for the expression is +, with 2 on the left and * on the right.
6. The print statement requires its final semicolon.

The parser describes grouping; it does not compute 14 at this checkpoint.

For 20 - 5 - 3, expression repeatedly combines the previous left node with the
next operator and term. This produces (20 - 5) - 3 instead of 20 - (5 - 3).

## Source locations

Tokens retain line, column, and browser selection offsets. AST nodes retain spans.
Binary and unary nodes also retain the operator's span, which the runner can use
for a later numeric-limit diagnostic. Grouping nodes cover parentheses while
their inner identifiers keep their own exact positions for semantic diagnostics.

## Bounds and integer precision

A new parser instance is created per call. Nesting is checked before descending,
and node depth is checked while constructing the tree. This protects later AST
traversals. Integer values are canonical decimal strings so JavaScript Number
does not round large literals; the future arithmetic runner will convert them to BigInt.

## Failure and honest phase status

A lexical error skips parsing. A syntax error leaves the completed token output
available but produces no AST. After successful parsing the semantic phase is
still marked not built. Undeclared variables and duplicate declarations are
semantic tasks and are deliberately not rejected by this parser.

## Tests and engineering evidence

- Lexer tests cover the exact vocabulary, first-error behavior, comments, newlines,
  Unicode positions, source-size limits, and literal-length bounds.
- Parser tests check AST structure, precedence, associativity, unary/grouping behavior,
  complete input consumption, diagnostic positions, exact integers, and nesting/depth boundaries.
- Pipeline tests verify phase ordering, failure short-circuiting, fresh results, and all examples.
- Server-rendered AST component tests check real node labels, empty programs, grouping,
  and large literal display.
- GitHub Actions runs the tests and production build on the reviewed source.

Run npm test and npm run build locally to reproduce the checks. CI logs provide
actual outcomes; examples in the language specification describe required behavior.

## Understanding checkpoint

1. Why does term consume 3 * 4 before expression constructs the addition?
2. Which loop makes subtraction left-associative?
3. Why does print missing; parse successfully before semantic analysis exists?
4. Why are AST literal values stored as decimal strings?
