/**
 * Phase 3: semantic analysis.
 *
 *   input:  the parser's immutable AST (Program)
 *   output: a symbol table + semantic diagnostics
 *
 * Rules from docs/language-spec.md:
 * - one global scope; names are case-sensitive;
 * - every variable is declared once, with let;
 * - a variable must be declared before it is used;
 * - a declaration's initializer is checked BEFORE its name is introduced,
 *   so `let total = total + 1;` uses an undeclared name.
 *
 * Diagnostic policy: like the lexer and parser, analysis stops at the FIRST
 * error in source order. Declarations checked before that point are returned
 * as a partial symbol table (complete = false).
 *
 * The analyzer only reads the AST. It does not evaluate expressions, so the
 * symbol table records where and how a name is declared, never a value.
 */
import type { Expression, LetDeclaration, Program, SourceSpan } from './ast';
import type { Diagnostic, DiagnosticCode } from './diagnostics';

export interface SymbolEntry {
  readonly name: string;
  /** .mcl version 1 has a single type. */
  readonly type: 'integer';
  /** Span of the name in its let declaration. */
  readonly declaredAt: SourceSpan;
}

export interface SymbolTable {
  /** Symbols in declaration order. */
  readonly symbols: readonly SymbolEntry[];
  /** False when analysis stopped at an error: only earlier declarations are listed. */
  readonly complete: boolean;
}

export interface SemanticResult {
  readonly symbolTable: SymbolTable;
  readonly diagnostics: readonly Diagnostic[];
}

/** Public entry point. Every call builds a brand-new symbol table. */
export function analyze(program: Program): SemanticResult {
  return new SemanticAnalyzer(program).run();
}

class SemanticAnalyzer {
  private readonly program: Program;
  /**
   * The symbol table. A Map keeps insertion (declaration) order, and its keys
   * are plain data: names like "__proto__" or "constructor" cannot collide
   * with built-in object properties the way they could on a {} object.
   */
  private readonly symbols = new Map<string, SymbolEntry>();
  /** First declaration of every name in the program, for "declared later" messages. */
  private readonly declaredLater = new Map<string, SourceSpan>();
  /** The let declaration whose initializer is being checked, if any. */
  private current: LetDeclaration | null = null;

  constructor(program: Program) {
    this.program = program;
    for (const statement of program.statements) {
      if (statement.kind === 'LetDeclaration' && !this.declaredLater.has(statement.name)) {
        this.declaredLater.set(statement.name, statement.nameSpan);
      }
    }
  }

  run(): SemanticResult {
    for (const statement of this.program.statements) {
      const problem = statement.kind === 'LetDeclaration'
        ? this.declaration(statement)
        : this.expression(statement.expression);
      if (problem) return this.finish([problem]);
    }
    return this.finish([]);
  }

  /** let name = initializer;  checked in source order: name, then initializer, then introduce. */
  private declaration(statement: LetDeclaration): Diagnostic | null {
    const earlier = this.symbols.get(statement.name);
    if (earlier) {
      return this.error(
        'duplicate-declaration',
        statement.nameSpan,
        `Variable '${statement.name}' is already declared at line ${earlier.declaredAt.line}, column ${earlier.declaredAt.column}.`,
        'a name that has not been declared yet',
        statement.name,
      );
    }

    this.current = statement;
    const problem = this.expression(statement.initializer);
    this.current = null;
    if (problem) return problem;

    // Only now does the name exist for later statements.
    this.symbols.set(statement.name, Object.freeze({
      name: statement.name,
      type: 'integer',
      declaredAt: statement.nameSpan,
    }));
    return null;
  }

  /** Visit an expression left to right, returning the first problem found. */
  private expression(node: Expression): Diagnostic | null {
    switch (node.kind) {
      case 'IntegerLiteral':
        return null; // literals need no checks; their exact text is never touched
      case 'Identifier':
        return this.symbols.has(node.name) ? null : this.undeclared(node.name, node.span);
      case 'UnaryExpression':
        return this.expression(node.argument);
      case 'BinaryExpression':
        return this.expression(node.left) ?? this.expression(node.right);
      case 'GroupingExpression':
        return this.expression(node.expression);
    }
  }

  /** Explain WHY a name is unavailable: own initializer, declared later, or never declared. */
  private undeclared(name: string, span: SourceSpan): Diagnostic {
    const expected = 'a variable declared earlier with let';
    if (this.current?.name === name) {
      return this.error('undeclared-variable', span,
        `Variable '${name}' is used in its own initializer. It is declared only after the initializer is checked.`,
        expected, name);
    }
    const later = this.declaredLater.get(name);
    if (later && later.offset > span.offset) {
      return this.error('undeclared-variable', span,
        `Variable '${name}' is used before its declaration at line ${later.line}, column ${later.column}.`,
        expected, name);
    }
    return this.error('undeclared-variable', span, `Undeclared variable '${name}'.`, expected, name);
  }

  private error(
    code: DiagnosticCode, at: SourceSpan, message: string, expected: string, found: string,
  ): Diagnostic {
    return Object.freeze({
      phase: 'semantic', severity: 'error', code, message,
      line: at.line, column: at.column, offset: at.offset, length: at.length,
      expected, found,
    });
  }

  private finish(diagnostics: Diagnostic[]): SemanticResult {
    return Object.freeze({
      symbolTable: Object.freeze({
        symbols: Object.freeze([...this.symbols.values()]),
        complete: diagnostics.length === 0,
      }),
      diagnostics: Object.freeze(diagnostics),
    });
  }
}
