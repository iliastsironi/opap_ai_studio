import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

let dbInstance: PGlite | null = null;

export async function getDb(): Promise<PGlite> {
  if (!dbInstance) {
    // Initialize PGlite database engine
    dbInstance = new PGlite();
    await initSchema(dbInstance);
  }
  return dbInstance;
}

async function initSchema(db: PGlite) {
  try {
    const schemaPath = path.resolve(process.cwd(), 'src/db/schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf-8');
      await db.exec(sql);
    }
  } catch (error) {
    console.error('Error initializing database schema:', error);
    throw error;
  }
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const db = await getDb();
  const res = await db.query<T>(sql, params);
  return res.rows;
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export async function execute(sql: string, params: unknown[] = []): Promise<void> {
  const db = await getDb();
  await db.query(sql, params);
}
