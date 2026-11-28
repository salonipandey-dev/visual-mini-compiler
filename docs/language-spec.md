# .mcl language specification

Version 0.2, 27 November 2026. This repository implements the web interface in
TypeScript. The integer-language scope follows the project SRS; earlier
Python/Tkinter implementation sketches are superseded by this web implementation.

## Source and tokens

Files use the .mcl extension and UTF-8 source text. Normalize CRLF and lone CR to LF.
When a file is opened, invalid UTF-8 is rejected (never replaced), a leading UTF-8
byte-order mark is removed, and files over 1 MB are refused; smaller files are never
truncated, and the source-length limit below is reported by compilation. Downloaded
source is the normalized text, as UTF-8 with LF newlines. See docs/file-workflow.md.
Spaces, tabs, and LF are ignored. A # comment extends to the next LF or EOF.
Only let and print are reserved keywords. Names are case-sensitive ASCII forms
matching [A-Za-z_][A-Za-z0-9_]*. Digits form a decimal integer literal.

| Implementation token type | Source forms |
| --- | --- |
| KEYWORD | let, print |
| IDENTIFIER | A complete non-keyword name |
| INT_LITERAL | One or more ASCII digits |
| OPERATOR | + - * = |
| DELIMITER | ( ) ; |
| ERROR | The first lexically invalid source fragment |
| EOF | End of normalized source; empty lexeme |

The grammar aliases IDENT and INT refer to IDENTIFIER and INT_LITERAL.
Quoted keyword/operator spellings distinguish tokens within the shared categories.
This vocabulary representation refines token display without changing the language.

Read whole names before classifying keywords: letter and print2 are identifiers.
Minus is a separate token, so -70 is unary minus applied to INT 70.
123abc produces INT 123 and IDENT abc; its juxtaposition is rejected by the parser.

## Grammar (EBNF)

~~~text
program     = { statement }, EOF ;
statement   = "let", IDENT, "=", expression, ";"
            | "print", expression, ";" ;
expression  = term, { ("+" | "-"), term } ;
term        = unary, { "*", unary } ;
unary       = "-", unary | primary ;
primary     = INT | IDENT | "(", expression, ")" ;
~~~

Braces denote zero or more repetitions. A vertical bar denotes alternatives.
Quoted punctuation is literal source text; unquoted punctuation describes the grammar.

Unary minus binds most tightly, then multiplication, then addition/subtraction.
Binary operators associate from the left. Parentheses explicitly group expressions.
Repeated unary minus is legal; unary plus and implicit multiplication are unsupported.

## Meaning

A declaration introduces a name after checking its initializer, in one global scope.
Names may be declared once. There is no reassignment. Every name used in an
expression must be declared by an earlier let statement. The only type is integer.
Semantic analysis (checkpoint 3) enforces these rules and builds the symbol table.

print evaluates an integer expression and appends its exact decimal value and a
newline to the output. Compiling checks the AST and generates intermediate
instructions without executing them; the runner (checkpoint 5) executes them when
the user presses Run.

| Expression | Required grouping | Execution result |
| --- | --- | --- |
| 2 + 3 * 4 | 2 + (3 * 4) | 14 |
| (2 + 3) * 4 | Group addition first | 20 |
| 20 - 5 - 3 | (20 - 5) - 3 | 12 |
| -3 * 2 | (-3) * 2 | -6 |
| --3 | -(-3) | 3 |
| 3--2 | 3 - (-2) | 5 |

Blank and comment-only programs are valid empty programs.
Float literals, strings, booleans, conditions, loops, division, C-style comments,
and native code generation are outside version 1.

## Positions and bounds

Lines/columns are 1-based, counting Unicode characters; a tab counts as one column.
Offsets and lengths are UTF-16 indices so browser text selection identifies the
correct source characters. Positions always refer to normalized source.

Source length is at most 5,000 Unicode characters, including comments and whitespace.
A literal has at most 100 digits, including leading zeroes. Parenthesized/unary
constructs may nest at most 50 levels. Expression operator depth is at most 50:
a literal/name has depth 1 and unary/binary operations add one. An explicit
GroupingExpression node keeps its child's operator depth; its syntactic nesting
is checked independently.

IntegerLiteral.value is canonical decimal text, preserving up to 100 digits exactly.
The runner uses exact BigInt arithmetic and requires every arithmetic result,
including intermediate results, to have an absolute value strictly below 10**100.
Each result is checked before it is stored; the first failure stops execution with
a runtime diagnostic at the operator's position, and output printed before it is
kept as partial output. See docs/runtime-walkthrough.md.

## Phase behavior

Input-size validation precedes lexing. Lexing stops on the first error, retaining
tokens scanned before the failure and a correctly positioned EOF. The parser does
not run after an input/lexical error. Syntax failure keeps completed tokens,
reports the expected/found source position, and skips semantic analysis.

For example, print missing; parses successfully because it has valid structure.
The semantic checker then rejects the unavailable name.

Semantic analysis runs only on a complete AST. It reports the first semantic error
in source order and stops; declarations accepted before that error form a partial
symbol table. Within let name = initializer;, the name is checked for duplication
first (it appears first), then the initializer, and only then is the name declared.
Undeclared-name diagnostics point at the identifier; duplicate-declaration
diagnostics point at the second declaration's name.

Intermediate code generation runs only after lexical, syntax, and semantic success;
otherwise it is skipped and produces no instructions. It emits COPY, ADD, SUB, MUL,
NEG, and PRINT instructions over tagged operands (integer, variable, temporary),
in source order with operands generated left to right before their operation.
Temporaries are numbered from %t1 for each compilation. Generation performs no
evaluation or constant folding; see docs/ir-walkthrough.md.

Every parse consumes the complete token stream and creates a new AST. AST nodes
and their child statement arrays are frozen; there is no shared mutable parser state.
