# Checkpoint 4: intermediate code walkthrough

## What changed

After semantic analysis succeeds, the compiler now translates the AST into
three-address instructions: small steps that each do at most one operation.
The Intermediate tab lists them. They are generated, not executed; running
them is the next checkpoint.

| File | Responsibility |
| --- | --- |
| src/compiler/ir.ts | Instruction and operand types (data only) |
| src/compiler/codegen.ts | generate(): AST to instructions |
| src/compiler/ir-format.ts | Turns instructions into readable text for display |
| src/ui/IntermediateView.tsx | The Intermediate tab |

## The instruction set

| Opcode | Meaning | Displayed as |
| --- | --- | --- |
| COPY | Give a declared variable its initial value | marks = 70 |
| ADD, SUB, MUL | Binary arithmetic into a new temporary | %t1 = 3 * 4 |
| NEG | Unary minus into a new temporary | %t1 = minus 3 |
| PRINT | Print an operand (when the runner exists) | PRINT %t2 |

Each instruction is a frozen object with an opcode field, for example:

~~~ts
{ opcode: 'MUL',
  target: { kind: 'temporary', id: 1 },
  left:   { kind: 'integer', value: '3' },
  right:  { kind: 'integer', value: '4' },
  span, operatorSpan }
~~~

Instructions are data, not strings or code. The runner will switch on opcode
and read the operands directly; it never parses text. Rendering happens only
in ir-format.ts.

NEG is shown as minus 3 rather than -3. In .mcl a minus sign is always an
operation, never part of a literal, and the word minus makes that visible.

## Tagged operands and temporary allocation

Every operand records what kind of value it is:

| kind | Holds | Example |
| --- | --- | --- |
| integer | Exact canonical decimal text from the AST | { kind: 'integer', value: '70' } |
| variable | A name declared in the source | { kind: 'variable', name: 'marks' } |
| temporary | A compiler-made intermediate result | { kind: 'temporary', id: 1 } |

Variables and temporaries are separate namespaces because the kind tag is part
of the operand. A source variable called t1 is { kind: 'variable', name: 't1' };
the first temporary is { kind: 'temporary', id: 1 }. On screen the temporary gets
a % prefix. A source name can never contain %, so the two cannot look the same either.

~~~text
let t1 = 7;        t1 = 7
print t1 + 1;      %t1 = t1 + 1
                   PRINT %t1
~~~

Literals keep the AST's canonical decimal string (007 becomes 7), so a
100-digit literal is never rounded through JavaScript Number.

Each call to generate() creates a new CodeGenerator whose counter starts at 1.
Every ADD, SUB, MUL, or NEG takes the next number, and numbering continues
across statements in one program. A recompilation always starts again at %t1.

## Instruction ordering

The generator walks the AST once:

1. Statements in source order.
2. For an operation: generate the left operand completely, then the right
   operand, then emit the operation into a new temporary.
3. A literal or variable needs no instruction; it is used directly as an operand.
4. A GroupingExpression emits nothing and generates its inner expression.
5. let name = expr; generates expr, then COPY name. print expr; generates expr, then PRINT.

The parser already built precedence and associativity into the tree, so following
the tree is enough. For print 2 + 3 * 4; the root is + with 3 * 4 as its right child:

~~~text
        +              %t1 = 3 * 4      (right child finished first,
       / \             %t2 = 2 + %t1     because the left child 2 needs no code)
      2   *            PRINT %t2
         / \
        3   4
~~~

For 20 - 5 - 3 the tree is (20 - 5) - 3, so %t1 = 20 - 5 comes before %t2 = %t1 - 3.

## Source-span preservation

Instructions reuse the AST's span objects; nothing is recomputed:

| Instruction | span | Extra |
| --- | --- | --- |
| ADD, SUB, MUL | The whole binary expression | operatorSpan: the operator |
| NEG | The whole unary expression | operatorSpan: the minus sign |
| COPY | The let statement | targetSpan: the declared name |
| PRINT | The print statement | |

Choosing an instruction in the Intermediate tab highlights its operator (for
arithmetic) or its statement in the editor. The runner will use operatorSpan to
point at the exact operator if a result exceeds the 10^100 limit.

## Compilation versus execution

Generation runs only after lexical, syntax, and semantic analysis all succeed.
After any earlier failure the Intermediate phase is marked skipped and its output
is null, so a failed compilation never offers instructions that could be run.
An empty program generates an empty, valid instruction list.

Generation does not calculate anything: print 2 + 3; becomes an ADD instruction,
not the number 5. It does not change the AST or the symbol table.
The next checkpoint's runner will execute these instructions with exact BigInt
arithmetic and produce the program's printed output.

## Understanding checkpoint

1. Why does print 2 + 3 * 4; produce the multiplication first?
2. Why is a temporary a tagged object instead of the string "t1"?
3. What prevents a failed compilation from producing runnable instructions?
