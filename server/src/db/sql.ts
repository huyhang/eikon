import type { SQLInputValue } from 'node:sqlite';

/** A piece of SQL with its positional parameters, composable without string-concatenating values. */
export interface SqlFragment {
  text: string;
  params: SQLInputValue[];
}

export function sql(text: string, ...params: SQLInputValue[]): SqlFragment {
  return { text, params };
}

export function joinSql(fragments: SqlFragment[], separator: string): SqlFragment {
  return {
    text: fragments.map((f) => f.text).join(separator),
    params: fragments.flatMap((f) => f.params),
  };
}

/** Combines conditions with AND; an empty list means "no restriction". */
export function whereAll(conditions: SqlFragment[]): SqlFragment {
  if (conditions.length === 0) return sql('1 = 1');
  return joinSql(
    conditions.map((c) => ({ text: `(${c.text})`, params: c.params })),
    ' AND ',
  );
}

export function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}
