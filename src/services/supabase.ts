import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

// Same role cleanFirestoreData() played: services build objects that may
// contain `undefined` (an omitted optional field) - strip those before
// sending, so a PostgREST upsert doesn't try to write literal "undefined".
export function cleanData<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map((item) => cleanData(item)) as unknown as T;
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleaned[key] = cleanData(value);
      }
    }
    return cleaned as T;
  }
  return data;
}

export async function handleSupabaseError(error: unknown, operationType: OperationType, path: string | null) {
  const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
  // Supabase/PostgREST errors are plain objects (code/message/details/hint),
  // never `instanceof Error` - the old `String(error)` fallback collapsed
  // every one of them to the literal text "[object Object]", discarding the
  // actual message. This still logs full diagnostic context to the console,
  // but throws an Error carrying just the real message, since callers
  // display e.message directly to the user (see ShiftClosingWizard's
  // draftSaveError) rather than parsing it back out.
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error);
  const errInfo = {
    error: message,
    authInfo: { userId: user?.id, email: user?.email },
    operationType,
    path,
  };
  console.error('Supabase Error: ', JSON.stringify(errInfo));
  throw new Error(message);
}
