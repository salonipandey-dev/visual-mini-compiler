/**
 * ir-format.ts — turns instruction objects into readable text, for display only.
 *
 * The generator never builds strings and the runner never parses them:
 * this module is the only place an instruction becomes text.
 *
 *   %t1 = 3 * 4        BinaryInstruction (MUL)
 *   %t2 = minus %t1    NegInstruction
 *   marks = 70         CopyInstruction
 *   PRINT %t2          PrintInstruction
 */
import type { Instruction, Operand } from './ir';

/** One piece of an instruction's text, tagged so the UI can colour it. */
export interface InstructionPart {
  readonly text: string;
  readonly role: Operand['kind'] | 'operator' | 'keyword';
}

const SYMBOL = { ADD: '+', SUB: '-', MUL: '*' } as const;

export function formatOperand(operand: Operand): string {
  switch (operand.kind) {
    case 'integer': return operand.value;
    case 'variable': return operand.name;
    case 'temporary': return '%t' + operand.id;
  }
}

export function instructionParts(instruction: Instruction): readonly InstructionPart[] {
  const op = (operand: Operand): InstructionPart => ({ text: formatOperand(operand), role: operand.kind });
  const text = (value: string, role: 'operator' | 'keyword' = 'operator'): InstructionPart => ({ text: value, role });

  switch (instruction.opcode) {
    case 'COPY':
      return [op(instruction.target), text(' = '), op(instruction.source)];
    case 'ADD':
    case 'SUB':
    case 'MUL':
      return [
        op(instruction.target), text(' = '), op(instruction.left),
        text(' ' + SYMBOL[instruction.opcode] + ' '), op(instruction.right),
      ];
    case 'NEG':
      return [op(instruction.target), text(' = '), text('minus', 'keyword'), text(' '), op(instruction.operand)];
    case 'PRINT':
      return [text('PRINT', 'keyword'), text(' '), op(instruction.operand)];
  }
}

export function formatInstruction(instruction: Instruction): string {
  return instructionParts(instruction).map((part) => part.text).join('');
}
