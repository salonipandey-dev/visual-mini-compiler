/**
 * runner.ts — executes intermediate instructions. This is NOT part of compiling.
 *
 *   compile(source)  ->  CompileResult (tokens, AST, symbols, instructions)
 *   execute(program) ->  ExecutionResult (printed output or a runtime diagnostic)
 *
 * The runner reads the generator's instruction objects directly: it switches
 * on `opcode` and resolves each operand by its `kind` tag. It never looks at
 * source text, never parses the display strings, and never uses eval/Function.
 *
 * Every call to execute() creates a new Machine with empty variable storage,
 * empty temporary storage, and empty output, so runs cannot affect each other.
 *
 * Integers are BigInt, so arithmetic is exact. After EVERY arithmetic operation,
 * before the result is stored, its absolute value must be strictly below 10^100.
 * If not, execution stops at that instruction with a runtime diagnostic that
 * points at the operator in the source, even if later steps would have brought
 * the value back into range.
 */
import type {
  BinaryInstruction, Diagnostic, Instruction, IntermediateProgram, NegInstruction, Operand,
} from '../compiler';

/** Values must satisfy |value| < INTEGER_LIMIT (10^100). */
export const INTEGER_LIMIT = 10n ** 100n;

export interface ExecutionResult {
  /** 'error' means execution stopped early at a runtime diagnostic. */
  readonly status: 'success' | 'error';
  /** One exact decimal string per PRINT that ran, in order. Partial when status is 'error'. */
  readonly lines: readonly string[];
  /** The output as a console would show it: every printed line followed by "\n". */
  readonly text: string;
  /** The runtime diagnostic when status is 'error'; otherwise null. */
  readonly diagnostic: Diagnostic | null;
  /** How many instructions completed. */
  readonly executedCount: number;
}

/**
 * A defect in the compiler or runner itself (for example, an operand that was
 * never given a value). A correctly compiled program can never cause this, so
 * it is thrown rather than reported as a problem in the user's program.
 */
export class RuntimeInternalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeInternalError';
  }
}

/** Run a compiled program from a completely fresh state. */
export function execute(program: IntermediateProgram): ExecutionResult {
  return new Machine().run(program);
}

const SYMBOL = { ADD: '+', SUB: '-', MUL: '*', NEG: 'unary -' } as const;
const CANONICAL_INTEGER = /^(0|[1-9][0-9]*)$/;

class Machine {
  /** Source variables, keyed by name: marks, t1, __proto__ ... */
  private readonly variables = new Map<string, bigint>();
  /** Compiler temporaries, keyed by number: 1 means %t1. A separate namespace. */
  private readonly temporaries = new Map<number, bigint>();
  private readonly lines: string[] = [];
  private executed = 0;

  run(program: IntermediateProgram): ExecutionResult {
    for (const instruction of program.instructions) {
      const problem = this.step(instruction);
      if (problem) return this.finish(problem); // stop immediately
      this.executed += 1;
    }
    return this.finish(null);
  }

  /** Execute one instruction. Returns a diagnostic if it exceeded the integer limit. */
  private step(instruction: Instruction): Diagnostic | null {
    switch (instruction.opcode) {
      case 'COPY':
        this.variables.set(instruction.target.name, this.read(instruction.source));
        return null;
      case 'ADD':
        return this.store(instruction, this.read(instruction.left) + this.read(instruction.right));
      case 'SUB':
        return this.store(instruction, this.read(instruction.left) - this.read(instruction.right));
      case 'MUL':
        return this.store(instruction, this.read(instruction.left) * this.read(instruction.right));
      case 'NEG':
        return this.store(instruction, -this.read(instruction.operand));
      case 'PRINT':
        // BigInt's toString() is exact decimal text; no Number conversion anywhere.
        this.lines.push(this.read(instruction.operand).toString());
        return null;
      default:
        throw new RuntimeInternalError(
          'Unknown instruction opcode: ' + String((instruction as { opcode: unknown }).opcode),
        );
    }
  }

  /** Check an arithmetic result BEFORE storing it in its temporary. */
  private store(instruction: BinaryInstruction | NegInstruction, value: bigint): Diagnostic | null {
    if (abs(value) >= INTEGER_LIMIT) return limitExceeded(instruction, value);
    this.temporaries.set(instruction.target.id, value);
    return null;
  }

  /** Resolve an operand by its tag. Each kind has its own storage. */
  private read(operand: Operand): bigint {
    switch (operand.kind) {
      case 'integer': {
        if (!CANONICAL_INTEGER.test(operand.value)) {
          throw new RuntimeInternalError(`Integer operand '${operand.value}' is not canonical decimal text.`);
        }
        const value = BigInt(operand.value);
        if (value >= INTEGER_LIMIT) {
          throw new RuntimeInternalError('Integer operand exceeds the limit the lexer enforces.');
        }
        return value;
      }
      case 'variable': {
        const value = this.variables.get(operand.name);
        if (value === undefined) throw new RuntimeInternalError(`Variable '${operand.name}' has no value.`);
        return value;
      }
      case 'temporary': {
        const value = this.temporaries.get(operand.id);
        if (value === undefined) throw new RuntimeInternalError(`Temporary %t${operand.id} has no value.`);
        return value;
      }
    }
  }

  private finish(diagnostic: Diagnostic | null): ExecutionResult {
    const lines = Object.freeze([...this.lines]);
    return Object.freeze({
      status: diagnostic ? 'error' : 'success',
      lines,
      text: lines.map((line) => line + '\n').join(''),
      diagnostic,
      executedCount: this.executed,
    });
  }
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

/** A runtime diagnostic located at the operator that produced the oversized value. */
function limitExceeded(instruction: BinaryInstruction | NegInstruction, value: bigint): Diagnostic {
  const digits = abs(value).toString().length;
  const at = instruction.operatorSpan;
  return Object.freeze({
    phase: 'runtime',
    severity: 'error',
    code: 'integer-limit-exceeded',
    message: `Integer limit exceeded: '${SYMBOL[instruction.opcode]}' produced a ${digits}-digit ${value < 0n ? 'negative ' : ''}value. Every value must have an absolute value below 10^100.`,
    line: at.line,
    column: at.column,
    offset: at.offset,
    length: at.length,
    expected: 'a result with absolute value below 10^100 (at most 100 digits)',
    found: `a ${digits}-digit result`,
  });
}
