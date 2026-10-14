import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { MIGRATIONS } from './migrations';
import type { SqlFragment } from './sql';

export type Row = Record<string, unknown>;

/** Thin wrapper over node:sqlite with statement caching and transactions. */
export class Database {
  private readonly statements = new Map<string, StatementSync>();

  constructor(private readonly db: DatabaseSync) {}

  static open(path: string): Database {
    const db = new DatabaseSync(path);
    db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    const database = new Database(db);
    database.migrate();
    return database;
  }

  static inMemory(): Database {
    return Database.open(':memory:');
  }

  all<T = Row>(query: string | SqlFragment, ...params: SQLInputValue[]): T[] {
    const { text, values } = normalize(query, params);
    return this.statement(text).all(...values) as T[];
  }

  get<T = Row>(query: string | SqlFragment, ...params: SQLInputValue[]): T | undefined {
    const { text, values } = normalize(query, params);
    return this.statement(text).get(...values) as T | undefined;
  }

  run(query: string | SqlFragment, ...params: SQLInputValue[]): { changes: number; lastInsertRowid: number } {
    const { text, values } = normalize(query, params);
    const result = this.statement(text).run(...values);
    return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
  }

  exec(script: string): void {
    this.db.exec(script);
  }

  transaction<T>(work: () => T): T {
    if (this.db.isTransaction) return work();
    this.db.exec('BEGIN');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }

  private statement(text: string): StatementSync {
    let statement = this.statements.get(text);
    if (!statement) {
      statement = this.db.prepare(text);
      this.statements.set(text, statement);
    }
    return statement;
  }

  private migrate(): void {
    const current = Number(this.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0);
    MIGRATIONS.slice(current).forEach((script, index) => {
      this.transaction(() => {
        this.exec(script);
        this.exec(`PRAGMA user_version = ${current + index + 1}`);
      });
    });
  }
}

function normalize(query: string | SqlFragment, params: SQLInputValue[]) {
  return typeof query === 'string'
    ? { text: query, values: params }
    : { text: query.text, values: query.params };
}
