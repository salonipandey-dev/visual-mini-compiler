# Checkpoint 5: runtime walkthrough

## What changed

The workbench can now execute a compiled program. A new runner in src/runtime/
reads the intermediate instructions directly and produces the program's output.
The Run button and Output panel connect it to the interface.

| File | Responsibility |
| --- | --- |
| src/runtime/runner.ts | execute(): run instructions with BigInt and the 10^100 limit |
| src/runtime/index.ts | Public runtime API and runnableProgram() |
| src/ui/OutputPanel.tsx | Output, runtime errors, and why Run is unavailable |
| src/ui/ErrorBoundary.tsx, src/ui/internalError.ts | Handling for internal defects |

## Compilation versus execution

~~~text
Compile:  source -> tokens -> AST -> symbol table -> instructions   (CompileResult)
Run:      instructions -> output or runtime diagnostic               (ExecutionResult)
~~~

Compiling checks and translates the program; it never runs it. Run executes
the instructions of the latest compilation. The two results are stored
separately: a runtime error never changes the compilation's status, and runtime
diagnostics appear under Output, not under Problems.

The compiler does not import the runtime. The runtime imports only the compiler's
types, and consumes the same frozen instruction objects the Intermediate tab shows.
It never reads the source text, never parses the display strings, and never uses
eval, Function, or any external service.

## How tagged operands are resolved

Each operand carries a kind tag, and the runner reads it from the matching storage:

| kind | Where the value comes from |
| --- | --- |
| integer | BigInt(operand.value), the exact canonical decimal text |
| variable | The variables Map, keyed by the source name |
| temporary | The temporaries Map, keyed by the temporary's number |

Instructions run in their generated order, one switch case per opcode:

| Opcode | Effect |
| --- | --- |
| COPY | variables[name] = value of source |
| ADD, SUB, MUL | compute left op right, check the limit, then temporaries[id] = result |
| NEG | compute -operand, check the limit, then temporaries[id] = result |
| PRINT | append the operand's decimal text and a newline to the output |

## Variable and temporary storage

Variables and temporaries live in two different Maps. A source variable named t1
is stored under the string "t1" in the variables Map; temporary %t1 is stored
under the number 1 in the temporaries Map. They can never overwrite each other:

~~~text
let t1 = 100;      t1 = 100           variables:   t1 -> 100
let x = 2 * 3;     %t1 = 2 * 3        temporaries: 1  -> 6
print t1;          x = %t1            variables:   x  -> 6
                   PRINT t1           output: "100\n"
~~~

## Fresh execution state

Every call to execute() creates a new Machine with empty variables, empty
temporaries, and empty output. Nothing survives from an earlier run, so running
the same compilation twice gives identical output instead of doubled output.
Each Run replaces the previous run's output in the panel.

Reading a variable or temporary that has no value cannot happen for a correctly
compiled program, so it is treated as an internal defect (see below), not as an
error in the user's program.

## BigInt arithmetic and numeric limits

All values are BigInt, so 9007199254740993 + 0 prints 9007199254740993 exactly.
JavaScript Number would round it. Printed values use BigInt's exact decimal text.

The language allows values whose absolute value is strictly below 10^100. After
every ADD, SUB, MUL, and NEG, before the result is stored, the runner checks it.
If the check fails, execution stops at that instruction, even if a later step
would have brought the value back into range:

~~~text
let big = 999...9;   (100 nines)
print big + 1 - 1;   %t1 = big + 1   ->  10^100: limit exceeded at '+'; stop
~~~

Literals cannot exceed the limit, because the lexer allows at most 100 digits.

## Output and runtime diagnostics

PRINT appends one integer followed by a newline. An ExecutionResult contains:

- status: success, or error if a limit check failed;
- lines and text: the output, as separate lines and as console text;
- diagnostic: the runtime diagnostic, or null;
- executedCount: how many instructions completed.

A runtime diagnostic uses the shared Diagnostic shape with phase runtime and code
integer-limit-exceeded. Its position is the instruction's operatorSpan, so it
points at the exact +, -, or * in the source. The Output panel shows the message
and a Show in source button, and the editor underlines the operator. Anything
printed before the failure is shown under "Partial output (printed before the error)".
The same compilation can be run again; each run starts from a fresh state.

Internal defects are different: a bug in the compiler or runner, never in the
user's program. The runner throws RuntimeInternalError. The Run handler catches
any error and reports it through reportInternalError, which writes the details
to the browser console. The panel then says an internal error occurred, without
a stack trace. A React ErrorBoundary around the whole workbench does the same
for errors that happen while rendering.

## The source-revision guard

Every edit increases the editor's revision number, and each compilation records
the revision it was made from. Run is enabled only when:

1. the latest compilation succeeded in every phase, including code generation; and
2. its revision equals the editor's current revision.

The Run handler checks both conditions again before executing, so the
Ctrl+Shift+Enter shortcut cannot bypass a disabled button. An edit, loading an
example, or a failed compilation makes Run unavailable. Undo is also an edit:
restoring the old text still requires compiling again. Changing the source or
compiling again clears the previous output. A successfully compiled empty program
is runnable and produces empty output.

## Remaining work

File import/export, final packaging, and the project report are later tasks.

## Understanding checkpoint

1. Why does print big + 1 - 1; fail even though the final answer would fit?
2. Where are variable t1 and temporary %t1 stored, and why can they not collide?
3. After an edit followed by Undo the text is identical. Why is Run still disabled?
