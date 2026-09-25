// Types for the parts of the vendored gliner-boundary.mjs this app uses.
export interface BoundaryEntity {
  label: string;
  text: string;
  start: number;
  end: number;
  score: number;
  wordStart?: number;
  wordEnd?: number;
}

export interface ExtractOptions {
  threshold?: number;
  maxWords?: number;
  parent?: string;
  descriptions?: Record<string, string>;
}

export class GlinerBoundaryRuntime {
  constructor(opts: {
    ort: unknown;
    session: unknown;
    tokenize: (token: string) => number[];
    pairTemperature?: number;
  });
  extract(text: string, labels: string[], opts?: ExtractOptions): Promise<BoundaryEntity[]>;
}

export const NATIVE_MAX_WORDS: number;
