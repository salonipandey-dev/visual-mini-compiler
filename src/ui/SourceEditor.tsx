/**
 * SourceEditor — a plain <textarea> with three layers kept in sync:
 *
 *   gutter (line numbers)  |  highlight layer (<pre>, behind)  +  textarea (in front, transparent)
 *
 * The highlight layer contains the same text in the same font, but the text is
 * invisible; only the <mark> backgrounds show through. That is how an error or
 * a selected token gets highlighted at its exact characters.
 */
import { useRef, useState, type ReactNode, type RefObject } from 'react';

export const LINE_HEIGHT = 22; // px; must match --code-line in styles.css

export interface Highlight {
  offset: number;
  length: number;
  /** error: every error range; token: the token picked in the table; focus-error: the error picked in Problems */
  kind: 'error' | 'token' | 'focus-error';
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  highlights: readonly Highlight[];
  errorLines: ReadonlySet<number>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

export function SourceEditor({ value, onChange, highlights, errorLines, textareaRef }: Props) {
  const gutterRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLPreElement>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });

  const lineCount = value.split('\n').length;

  // Keep the gutter and highlight layer scrolled exactly like the textarea.
  const syncScroll = (ta: HTMLTextAreaElement) => {
    if (layerRef.current) {
      layerRef.current.scrollTop = ta.scrollTop;
      layerRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
  };

  // Line/column of the caret, counted the same way as the lexer does.
  const updateCursor = (ta: HTMLTextAreaElement) => {
    const lines = ta.value.slice(0, ta.selectionStart).split('\n');
    const current = lines[lines.length - 1];
    setCursor({ line: lines.length, column: [...current].length + 1 });
  };

  return (
    <div className="editor">
      <div className="editor-frame">
        <div className="editor-gutter" ref={gutterRef} aria-hidden="true">
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} className={errorLines.has(i + 1) ? 'gutter-line has-error' : 'gutter-line'}>
              {i + 1}
            </div>
          ))}
        </div>
        <div className="editor-surface">
          <pre className="editor-layer" ref={layerRef} aria-hidden="true">
            {renderHighlights(value, highlights)}
          </pre>
          <textarea
            ref={textareaRef}
            className="editor-input"
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              updateCursor(e.target);
            }}
            onScroll={(e) => syncScroll(e.currentTarget)}
            onSelect={(e) => updateCursor(e.currentTarget)}
            aria-label="Source program"
            aria-describedby="editor-status"
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            wrap="off"
          />
        </div>
      </div>
      <div className="editor-status" id="editor-status">
        <span>
          Line {cursor.line}, column {cursor.column}
        </span>
        <span>{lineCount === 1 ? '1 line' : `${lineCount} lines`}</span>
        <span className="editor-hint">
          <kbd>Ctrl</kbd>+<kbd>Enter</kbd> compiles
        </span>
      </div>
    </div>
  );
}

/** Split the text into plain runs and <mark> runs. Overlapping ranges: the first one wins. */
function renderHighlights(text: string, highlights: readonly Highlight[]): ReactNode[] {
  const rank = { 'focus-error': 0, token: 1, error: 2 } as const;
  const sorted = [...highlights].sort((a, b) => a.offset - b.offset || rank[a.kind] - rank[b.kind]);

  const parts: ReactNode[] = [];
  let pos = 0;
  sorted.forEach((h, i) => {
    if (h.offset < pos || h.offset > text.length) return;
    const end = Math.min(text.length, h.offset + h.length);
    parts.push(text.slice(pos, h.offset));
    const empty = end === h.offset ? ' hl-empty' : '';
    parts.push(
      <mark key={i} className={`hl hl-${h.kind}${empty}`}>
        {text.slice(h.offset, end)}
      </mark>,
    );
    pos = end;
  });
  parts.push(text.slice(pos));
  // A trailing space keeps the layer as tall as the textarea when the text ends in "\n".
  parts.push(' ');
  return parts;
}
