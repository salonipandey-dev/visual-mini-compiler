import type { AstNode, Program } from '../compiler';

export function SyntaxView({ program }: { program: Program }) {
  return (
    <div className="syntax">
      <p className="ast-description">
        The parser built this tree from your source. The Semantic tab checks its variable declarations; execution is a later phase.
      </p>
      {program.statements.length === 0 && <p className="muted">Valid empty program: no statements.</p>}
      <div aria-label="Abstract syntax tree">
        <AstBranch node={program} />
      </div>
    </div>
  );
}

function AstBranch({ node }: { node: AstNode }) {
  const children = childrenOf(node);
  return (
    <details className="ast-node" open>
      <summary>
        <span className="ast-label">{labelOf(node)}</span>
        <span className="ast-position">Line {node.span.line}, column {node.span.column}</span>
      </summary>
      {children.map((child, index) => (
        <div className="ast-child" key={index}><AstBranch node={child} /></div>
      ))}
    </details>
  );
}

function childrenOf(node: AstNode): readonly AstNode[] {
  switch (node.kind) {
    case 'Program': return node.statements;
    case 'LetDeclaration': return [node.initializer];
    case 'PrintStatement': return [node.expression];
    case 'BinaryExpression': return [node.left, node.right];
    case 'UnaryExpression': return [node.argument];
    case 'GroupingExpression': return [node.expression];
    case 'IntegerLiteral':
    case 'Identifier': return [];
  }
}

function labelOf(node: AstNode): string {
  switch (node.kind) {
    case 'Program': return 'Program';
    case 'LetDeclaration': return 'Let declaration: ' + node.name;
    case 'PrintStatement': return 'Print statement';
    case 'IntegerLiteral': return 'Integer: ' + node.value;
    case 'Identifier': return 'Variable: ' + node.name;
    case 'UnaryExpression': return 'Unary: ' + node.operator;
    case 'BinaryExpression': return 'Binary: ' + node.operator;
    case 'GroupingExpression': return 'Grouped expression';
  }
}
