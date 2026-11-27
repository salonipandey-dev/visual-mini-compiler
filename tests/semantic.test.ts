import { describe, expect, it } from 'vitest';
import { analyze, compile, parse, tokenize, type Program, type SemanticResult } from '../src/compiler';

/** Parse source that must be lexically and syntactically valid. */
function program(source: string): Program {
  const lex = tokenize(source);
  expect(lex.diagnostics).toEqual([]);
  const parsed = parse(lex.tokens);
  expect(parsed.diagnostics).toEqual([]);
  if (!parsed.ast) throw new Error('Expected an AST.');
  return parsed.ast;
}

const check = (source: string): SemanticResult => analyze(program(source));

/** "name@line:col" for each symbol, in table order. */
const names = (result: SemanticResult): string[] =>
  result.symbolTable.symbols.map((s) => `${s.name}@${s.declaredAt.line}:${s.declaredAt.column}`);

/** Recursively check that every object in the AST is frozen. */
function deepFrozen(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(deepFrozen);
}

describe('semantic analysis: valid programs', () => {
  it('builds the symbol table in declaration order with type and position', () => {
    const result = check('let marks = 70;\nlet bonus = 5;\nprint marks + bonus;');
    expect(result.diagnostics).toEqual([]);
    expect(result.symbolTable.complete).toBe(true);
    expect(result.symbolTable.symbols).toEqual([
      { name: 'marks', type: 'integer', declaredAt: { offset: 4, length: 5, line: 1, column: 5 } },
      { name: 'bonus', type: 'integer', declaredAt: { offset: 20, length: 5, line: 2, column: 5 } },
    ]);
  });

  it('keeps declaration order rather than alphabetical order', () => {
    expect(names(check('let zeta = 1; let alpha = 2; let mid = zeta;'))).toEqual([
      'zeta@1:5', 'alpha@1:19', 'mid@1:34',
    ]);
  });

  it('accepts references inside unary, binary, and grouped expressions', () => {
    const result = check('let a = 2;\nlet b = -(a + 3) * a;\nprint --b - (a * (b));');
    expect(result.diagnostics).toEqual([]);
    expect(names(result)).toEqual(['a@1:5', 'b@2:5']);
  });

  it.each(['', '# only a comment', '\n\n# two blank lines and a comment\n'])(
    'accepts an empty or comment-only program with an empty, complete table: %j', (source) => {
      const result = check(source);
      expect(result.diagnostics).toEqual([]);
      expect(result.symbolTable).toEqual({ symbols: [], complete: true });
    },
  );

  it('accepts print statements that use only literals', () => {
    expect(check('print 2 + 3 * 4;').symbolTable).toEqual({ symbols: [], complete: true });
  });

  it('treats names as case-sensitive', () => {
    const result = check('let total = 1; let Total = 2; print total + Total;');
    expect(result.diagnostics).toEqual([]);
    expect(names(result)).toEqual(['total@1:5', 'Total@1:20']);
  });
});

describe('semantic analysis: undeclared names', () => {
  it('reports an undeclared variable at the exact name', () => {
    const result = check('print missing;');
    expect(result.diagnostics).toEqual([{
      phase: 'semantic', severity: 'error', code: 'undeclared-variable',
      message: "Undeclared variable 'missing'.",
      line: 1, column: 7, offset: 6, length: 7,
      expected: 'a variable declared earlier with let', found: 'missing',
    }]);
    expect(result.symbolTable).toEqual({ symbols: [], complete: false });
  });

  it.each([
    ['print -missing;', 8],
    ['print 1 + missing;', 11],
    ['print missing * 2;', 7],
    ['print (1 + (missing));', 13],
    ['print -(2 * (3 - missing));', 18],
  ])('finds an undeclared name nested in %j at column %i', (source, column) => {
    const [d] = check(source).diagnostics;
    expect(d).toMatchObject({ code: 'undeclared-variable', line: 1, column, found: 'missing' });
  });

  it('explains a use before the later declaration', () => {
    const result = check('print rate * 2;\nlet rate = 5;');
    expect(result.diagnostics[0]).toMatchObject({
      code: 'undeclared-variable', line: 1, column: 7,
      message: "Variable 'rate' is used before its declaration at line 2, column 5.",
    });
  });

  it('also rejects a later declaration used inside an earlier initializer', () => {
    const [d] = check('let a = b + 1;\nlet b = 2;').diagnostics;
    expect(d).toMatchObject({ code: 'undeclared-variable', line: 1, column: 9, found: 'b' });
  });

  it('checks the initializer before introducing the declared name', () => {
    const result = check('let total = total + 1;');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: 'undeclared-variable', line: 1, column: 13, offset: 12, length: 5, found: 'total',
    });
    expect(result.diagnostics[0].message).toContain('its own initializer');
    expect(result.symbolTable.symbols).toEqual([]);
  });

  it('allows a later declaration to use an earlier one', () => {
    expect(check('let total = 1; let next = total + 1;').diagnostics).toEqual([]);
  });

  it('treats a differently-cased name as undeclared', () => {
    const [d] = check('let total = 10;\nprint Total;').diagnostics;
    expect(d).toMatchObject({ code: 'undeclared-variable', line: 2, column: 7, found: 'Total' });
  });
});

describe('semantic analysis: duplicate declarations', () => {
  it('reports the second declaration at its name and keeps the first in a partial table', () => {
    const result = check('let score = 10;\nlet score = 20;');
    expect(result.diagnostics).toEqual([{
      phase: 'semantic', severity: 'error', code: 'duplicate-declaration',
      message: "Variable 'score' is already declared at line 1, column 5.",
      line: 2, column: 5, offset: 20, length: 5,
      expected: 'a name that has not been declared yet', found: 'score',
    }]);
    expect(names(result)).toEqual(['score@1:5']);
    expect(result.symbolTable.complete).toBe(false);
  });

  it('reports the duplicate name before problems in its initializer (source order)', () => {
    const [d] = check('let x = 1;\nlet x = y;').diagnostics;
    expect(d).toMatchObject({ code: 'duplicate-declaration', line: 2, column: 5 });
  });
});

describe('semantic analysis: diagnostic policy and positions', () => {
  it('reports only the first semantic error, in source order', () => {
    const result = check('let a = 1;\nprint b;\nlet a = 2;\nprint c;');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({ line: 2, column: 7, found: 'b' });
    expect(names(result)).toEqual(['a@1:5']);
  });

  it('reports the left operand first when both sides are undeclared', () => {
    expect(check('print left + right;').diagnostics[0]).toMatchObject({ found: 'left', column: 7 });
  });

  it('gives positions that select the name in the editor, after tabs and non-ASCII comments', () => {
    const source = '# naïve \u{1F600}\n\tprint  missing;';
    const [d] = check(source).diagnostics;
    expect(d).toMatchObject({ line: 2, column: 9 });
    expect(source.slice(d.offset, d.offset + d.length)).toBe('missing');
  });

  it('positions duplicate diagnostics on the second name, not the let keyword', () => {
    const source = 'let a = 1;\n  let   a = 2;';
    const [d] = check(source).diagnostics;
    expect(d).toMatchObject({ line: 2, column: 9 });
    expect(source.slice(d.offset, d.offset + d.length)).toBe('a');
  });
});

describe('semantic analysis: safety and purity', () => {
  it('stores names such as __proto__ and constructor as ordinary symbols', () => {
    const result = check('let __proto__ = 1;\nlet constructor = 2;\nprint __proto__ + constructor;');
    expect(result.diagnostics).toEqual([]);
    expect(names(result)).toEqual(['__proto__@1:5', 'constructor@2:5']);
  });

  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'])(
    'does not treat the built-in object property %s as declared', (name) => {
      const [d] = check(`print ${name};`).diagnostics;
      expect(d).toMatchObject({ code: 'undeclared-variable', found: name });
    },
  );

  it('detects a duplicate __proto__ declaration', () => {
    const [d] = check('let __proto__ = 1; let __proto__ = 2;').diagnostics;
    expect(d).toMatchObject({ code: 'duplicate-declaration', column: 24 });
  });

  it('builds a fresh symbol table for every analysis', () => {
    const first = check('let x = 1;');
    const second = check('print x;');
    expect(names(first)).toEqual(['x@1:5']);
    expect(second.diagnostics[0]).toMatchObject({ code: 'undeclared-variable', found: 'x' });
    const again = check('let x = 1;');
    expect(again).toEqual(first);
    expect(again.symbolTable).not.toBe(first.symbolTable);
  });

  it('does not modify the AST it analyzes', () => {
    const ast = program('let a = 1;\nlet b = -(a + 2) * a;\nprint b;\nprint c;');
    const before = JSON.stringify(ast);
    const firstStatement = ast.statements[0];
    analyze(ast);
    analyze(ast);
    expect(JSON.stringify(ast)).toBe(before);
    expect(ast.statements[0]).toBe(firstStatement);
    expect(deepFrozen(ast)).toBe(true);
  });

  it('reuses the AST spans for symbol positions', () => {
    const ast = program('let marks = 70;');
    const [statement] = ast.statements;
    if (statement.kind !== 'LetDeclaration') throw new Error('Expected a declaration.');
    expect(analyze(ast).symbolTable.symbols[0].declaredAt).toBe(statement.nameSpan);
  });

  it('returns frozen results', () => {
    const result = check('let a = 1;');
    expect(deepFrozen(result)).toBe(true);
  });

  it('leaves 100-digit literals exactly as written in the AST', () => {
    const digits = '9'.repeat(100);
    const ast = program(`let big = ${digits};\nprint big;`);
    expect(analyze(ast).diagnostics).toEqual([]);
    const [statement] = ast.statements;
    if (statement.kind !== 'LetDeclaration' || statement.initializer.kind !== 'IntegerLiteral') {
      throw new Error('Expected an integer declaration.');
    }
    expect(statement.initializer.value).toBe(digits);
  });
});

describe('semantic analysis in the pipeline', () => {
  it('reports semantic success with the symbol table', () => {
    const result = compile('let marks = 70;\nlet bonus = 5;\nprint marks + bonus;');
    expect(result.failedPhase).toBeNull();
    expect(result.phases.semantic.status).toBe('success');
    expect(result.phases.semantic.output?.symbols.map((s) => s.name)).toEqual(['marks', 'bonus']);
    expect(result.diagnostics).toEqual([]);
  });

  it('marks semantic failure while keeping tokens and the AST', () => {
    const result = compile('print missing;');
    expect(result.failedPhase).toBe('semantic');
    expect(result.phases.lexical.status).toBe('success');
    expect(result.phases.syntax.status).toBe('success');
    expect(result.phases.syntax.output?.statements).toHaveLength(1);
    expect(result.phases.semantic.status).toBe('error');
    expect(result.phases.semantic.output).toEqual({ symbols: [], complete: false });
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({ phase: 'semantic', column: 7 });
  });

  it.each([
    ['input', ' '.repeat(5001) + 'print missing;'],
    ['lexical', 'print missing @ 2;'],
    ['syntax', 'print missing +;'],
  ])('skips semantic analysis after a(n) %s failure', (phase, source) => {
    const result = compile(source);
    expect(result.failedPhase).toBe(phase);
    expect(result.phases.semantic).toMatchObject({ status: 'skipped', output: null, diagnostics: [] });
    expect(result.diagnostics.every((d) => d.phase !== 'semantic')).toBe(true);
  });

  it('recovers after the semantic error is corrected', () => {
    expect(compile('let score = 10;\nlet score = 20;').failedPhase).toBe('semantic');
    const fixed = compile('let score = 10;\nlet bonus = 20;');
    expect(fixed.failedPhase).toBeNull();
    expect(fixed.phases.semantic.output?.symbols.map((s) => s.name)).toEqual(['score', 'bonus']);
  });
});
