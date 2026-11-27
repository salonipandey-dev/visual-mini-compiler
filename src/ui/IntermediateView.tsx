/**
 * IntermediateView — the code generator's real output: three-address instructions,
 * in the order the runner follows them. Generating them does not execute them.
 * Picking an instruction highlights the source it came from (the operator for arithmetic).
 */
import { formatInstruction, instructionParts, type Instruction, type IntermediateProgram } from '../compiler';

interface Props {
  program: IntermediateProgram;
  /** Results no longer match the editor text, so source links are disabled. */
  stale: boolean;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}

export function IntermediateView({ program, stale, selectedIndex, onSelect }: Props) {
  const count = program.instructions.length;
  const temps = program.temporaryCount;

  return (
    <div className="intermediate">
      <p className="phase-banner banner-info">
        These instructions were generated from the checked AST. Generating them does not execute
        them: press Run to execute them, and the printed output appears under Output.
      </p>

      <div className="symbol-heading">
        <h3 id="instructions-heading">Three-address instructions</h3>
        <span className="symbol-count">
          {count === 1 ? '1 instruction' : `${count} instructions`},{' '}
          {temps === 1 ? '1 temporary' : `${temps} temporaries`}
        </span>
      </div>

      {count === 0 ? (
        <p className="symbols-empty">
          The program has no statements, so the instruction list is empty. That is a valid result.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="token-table instruction-table" aria-labelledby="instructions-heading">
            <thead>
              <tr>
                <th scope="col" className="num">#</th>
                <th scope="col">Instruction</th>
                <th scope="col">Opcode</th>
                <th scope="col" className="num">Line</th>
                <th scope="col" className="num">Col</th>
              </tr>
            </thead>
            <tbody>
              {program.instructions.map((instruction, i) => {
                const at = sourceOf(instruction);
                return (
                  <tr key={i} className={i === selectedIndex ? 'row-selected' : ''}>
                    <td className="num muted">{i + 1}</td>
                    <td>
                      <button
                        type="button"
                        className="lexeme instruction"
                        aria-pressed={i === selectedIndex}
                        aria-label={`${formatInstruction(instruction)}: show source`}
                        onClick={() => onSelect(i)}
                        disabled={stale}
                      >
                        {instructionParts(instruction).map((part, j) => (
                          <span key={j} className={`ir-${part.role}`}>{part.text}</span>
                        ))}
                      </button>
                    </td>
                    <td>
                      <span className={`tok tok-op-${instruction.opcode}`}>{instruction.opcode}</span>
                    </td>
                    <td className="num">{at.line}</td>
                    <td className="num">{at.column}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Where an instruction came from: the operator for arithmetic, the statement otherwise. */
export function sourceOf(instruction: Instruction) {
  return 'operatorSpan' in instruction ? instruction.operatorSpan : instruction.span;
}
