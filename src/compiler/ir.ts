/**
 * ir.ts — the intermediate representation (IR): three-address instructions.
 *
 * Each instruction does at most one operation on at most two operands and
 * writes one target. Instructions are plain immutable data, never strings or
 * code, so the runner (src/runtime) reads them directly with a switch on `opcode`.
 *
 * Operands are tagged by `kind`, which keeps three namespaces apart:
 *   integer   — an exact literal, stored as canonical decimal text
 *   variable  — a name declared in the source program (e.g. marks, t1)
 *   temporary — a value created by the compiler, numbered 1, 2, 3...
 *               and rendered as %t1, %t2... ('%' cannot appear in a source name)
 */
import type { SourceSpan } from './ast';

export interface IntegerOperand {
  readonly kind: 'integer';
  /** Exact canonical decimal text, e.g. "70". Never a JavaScript number. */
  readonly value: string;
}
export interface VariableOperand {
  readonly kind: 'variable';
  readonly name: string;
}
export interface TemporaryOperand {
  readonly kind: 'temporary';
  /** 1-based number within one generated program. */
  readonly id: number;
}
export type Operand = IntegerOperand | VariableOperand | TemporaryOperand;

export type BinaryOpcode = 'ADD' | 'SUB' | 'MUL';

/** variable = source        (from `let variable = ...;`) */
export interface CopyInstruction {
  readonly opcode: 'COPY';
  readonly target: VariableOperand;
  readonly source: Operand;
  /** The whole let statement. */
  readonly span: SourceSpan;
  /** The declared name in the let statement. */
  readonly targetSpan: SourceSpan;
}

/** temporary = left (+ | - | *) right */
export interface BinaryInstruction {
  readonly opcode: BinaryOpcode;
  readonly target: TemporaryOperand;
  readonly left: Operand;
  readonly right: Operand;
  /** The whole source expression this instruction computes. */
  readonly span: SourceSpan;
  /** The arithmetic operator in the source, for future runtime diagnostics. */
  readonly operatorSpan: SourceSpan;
}

/** temporary = minus operand   (unary minus) */
export interface NegInstruction {
  readonly opcode: 'NEG';
  readonly target: TemporaryOperand;
  readonly operand: Operand;
  readonly span: SourceSpan;
  readonly operatorSpan: SourceSpan;
}

/** PRINT operand   (from `print ...;`; output appears only when the runner executes it) */
export interface PrintInstruction {
  readonly opcode: 'PRINT';
  readonly operand: Operand;
  /** The whole print statement. */
  readonly span: SourceSpan;
}

export type Instruction = CopyInstruction | BinaryInstruction | NegInstruction | PrintInstruction;
export type Opcode = Instruction['opcode'];

/** The code generator's output for one program. */
export interface IntermediateProgram {
  /** Instructions in execution order. */
  readonly instructions: readonly Instruction[];
  /** How many temporaries were allocated (%t1 ... %tN). */
  readonly temporaryCount: number;
}
