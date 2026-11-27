/**
 * SemanticView — the semantic analyzer's real output: the symbol table.
 * It lists declarations only. Nothing has been executed, so there are no values.
 * Picking a name highlights its declaration in the editor.
 */
import type { Diagnostic, PhaseStatus, SymbolTable } from '../compiler';

interface Props {
  table: SymbolTable;
  status: PhaseStatus;
  diagnostics: readonly Diagnostic[];
  /** Results no longer match the editor text, so source links are disabled. */
  stale: boolean;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}

export function SemanticView({ table, status, diagnostics, stale, selectedIndex, onSelect }: Props) {
  const count = table.symbols.length;
  const title = table.complete ? 'Symbol table' : 'Partial symbol table';
  const first = diagnostics[0];

  return (
    <div className="semantic">
      {status === 'success' ? (
        <p className="phase-banner banner-success">
          Semantic analysis passed: every variable is declared once and declared before it is used.
          This checks the source only; it does not run the program, so the table has no values.
        </p>
      ) : (
        <p className="phase-banner banner-error">
          Semantic analysis stopped at its first error
          {first && ` (line ${first.line}, column ${first.column}): ${first.message}`} The table
          below is partial. It lists only the declarations checked before the error.
        </p>
      )}

      <div className="symbol-heading">
        <h3 id="symbol-table-heading">{title}</h3>
        <span className="symbol-count">
          {count === 1 ? '1 symbol' : `${count} symbols`} in one global scope
        </span>
      </div>

      {count === 0 ? (
        <p className="symbols-empty">
          {table.complete
            ? 'This program declares no variables, so the symbol table is empty.'
            : 'No declarations were checked before the error.'}
        </p>
      ) : (
        <div className="table-scroll">
          <table className="token-table symbol-table" aria-labelledby="symbol-table-heading">
            <thead>
              <tr>
                <th scope="col" className="num">#</th>
                <th scope="col">Name</th>
                <th scope="col">Type</th>
                <th scope="col" className="num">Line</th>
                <th scope="col" className="num">Col</th>
              </tr>
            </thead>
            <tbody>
              {table.symbols.map((symbol, i) => (
                <tr key={symbol.name} className={i === selectedIndex ? 'row-selected' : ''}>
                  <td className="num muted">{i + 1}</td>
                  <td>
                    <button
                      type="button"
                      className="lexeme"
                      aria-pressed={i === selectedIndex}
                      aria-label={`${symbol.name}: show declaration in the editor`}
                      onClick={() => onSelect(i)}
                      disabled={stale}
                    >
                      {symbol.name}
                    </button>
                  </td>
                  <td>
                    <span className="tok tok-TYPE">{symbol.type}</span>
                  </td>
                  <td className="num">{symbol.declaredAt.line}</td>
                  <td className="num">{symbol.declaredAt.column}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
