/**
 * codegen.ts — Phase 4: intermediate code generation.
 *
 *   input:  a Program AST that passed semantic analysis
 *   output: an IntermediateProgram (typed three-address instructions)
 *
 * The generator walks the AST once:
 * - statements in source order;
 * - for each operation, operands first (left, then right), then the operation,
 *   so the AST's precedence and left associativity decide the order;
 * - each arithmetic result goes into a NEW temporary, numbered from 1 for every
 *   generation;
 * - grouping (parentheses) emits nothing: it just generates its inner expression.
 *
 * It does not evaluate anything or fold constants: `print 2 + 3;` produces an
 * ADD instruction, not the number 5. It only reads the AST and never touches
 * the symbol table.
 */
import type { Expression, Program, Statement } from './ast';
import type {
  BinaryOpcode, Instruction, IntermediateProgram, Operand, TemporaryOperand,
} from './ir';

const BINARY_OPCODE: Readonly<Record<'+' | '-' | '*', BinaryOpcode>> = {
  '+': 'ADD',
  '-': 'SUB',
  '*': 'MUL',
};

/** Public entry point. Every call starts with no instructions and temporary %t1. */
export function generate(program: Program): IntermediateProgram {
  return new CodeGenerator().run(program);
}

class CodeGenerator {
  private readonly instructions: Instruction[] = [];
  private nextTemporary = 1;

  run(program: Program): IntermediateProgram {
    for (const statement of program.statements) this.statement(statement);
    return Object.freeze({
      instructions: Object.freeze(this.instructions),
      temporaryCount: this.nextTemporary - 1,
    });
  }

  private statement(statement: Statement): void {
    if (statement.kind === 'LetDeclaration') {
      // let marks = 70;   ->   marks = 70
      const source = this.expression(statement.initializer);
      this.emit({
        opcode: 'COPY',
        target: Object.freeze({ kind: 'variable', name: statement.name }),
        source,
        span: statement.span,
        targetSpan: statement.nameSpan,
      });
    } else {
      // print expr;   ->   (code for expr) then PRINT result
      const operand = this.expression(statement.expression);
      this.emit({ opcode: 'PRINT', operand, span: statement.span });
    }
  }

  /** Emit the code for an expression and return the operand that holds its value. */
  private expression(node: Expression): Operand {
    switch (node.kind) {
      case 'IntegerLiteral':
        return Object.freeze({ kind: 'integer', value: node.value });
      case 'Identifier':
        return Object.freeze({ kind: 'variable', name: node.name });
      case 'GroupingExpression':
        return this.expression(node.expression);
      case 'UnaryExpression': {
        const operand = this.expression(node.argument);
        const target = this.temporary();
        this.emit({
          opcode: 'NEG', target, operand, span: node.span, operatorSpan: node.operatorSpan,
        });
        return target;
      }
      case 'BinaryExpression': {
        const left = this.expression(node.left); // operands first, left to right...
        const right = this.expression(node.right);
        const target = this.temporary(); // ...then the result's temporary
        this.emit({
          opcode: BINARY_OPCODE[node.operator],
          target, left, right, span: node.span, operatorSpan: node.operatorSpan,
        });
        return target;
      }
    }
  }

  private temporary(): TemporaryOperand {
    const id = this.nextTemporary;
    this.nextTemporary += 1;
    return Object.freeze({ kind: 'temporary', id });
  }

  private emit(instruction: Instruction): void {
    this.instructions.push(Object.freeze(instruction));
  }
}
