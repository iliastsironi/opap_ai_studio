import { supabase } from './supabase.ts';
import { packPieces, packValue } from '../lib/scratchBarcode.ts';
import { rowsWrittenProblem } from '../lib/writeGuard.ts';

/**
 * Η αποθήκη των σκρατς: τι παρελήφθη, τι περιμένει, τι βγήκε.
 *
 * Ξεχωριστή ανά κατάστημα. Ένα πακέτο ανήκει σε ένα κατάστημα από τη
 * στιγμή της παραλαβής και δεν μετακινείται σε άλλο - αν χρειαστεί, είναι
 * απόσυρση από το ένα και παραλαβή στο άλλο, που είναι και ό,τι συμβαίνει
 * στην πραγματικότητα.
 */

const TABLE = 'scratch_warehouse_packs';

export type PackStatus = 'IN_WAREHOUSE' | 'IN_STORE' | 'WITHDRAWN';

export interface WarehousePack {
  id: string;
  organization_id: string;
  store_id: string;
  game_no: string;
  catalog_code: string;
  game_name: string;
  pack_code: string;
  pieces: number;
  unit_price: number;
  received_at: string;
  status: PackStatus;
  moved_at: string | null;
  moved_shift_id: string | null;
  withdrawn_at: string | null;
  withdrawn_reason: string | null;
}

/** Ένα παιχνίδι όπως το χρειάζεται η αποθήκη: με τον 4ψήφιο και το μέγεθος. */
export interface WarehouseGame {
  gameNo: string;
  catalogCode: string;
  name: string;
  price: number;
  pieces: number;
  value: number;
}

/**
 * Τα παιχνίδια που μπορούν να μπουν στην αποθήκη.
 *
 * Μόνο όσα έχουν 4ψήφιο: χωρίς αυτόν δεν υπάρχει τίποτα να σκαναριστεί. Ένα
 * παιχνίδι που πρόσθεσε το κατάστημα και δεν του έδωσε αριθμό λείπει από
 * εδώ - και αυτό είναι σωστό, γιατί η εναλλακτική θα ήταν να επινοηθεί.
 */
export async function fetchWarehouseGames(
  orgId: string,
  storeId?: string
): Promise<WarehouseGame[]> {
  let q = supabase
    .from('scratch_catalog')
    .select('code,name,price,game_no,pack_pieces')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .not('game_no', 'is', null);
  q = storeId ? q.or(`store_id.eq.${storeId},store_id.is.null`) : q.is('store_id', null);

  const { data, error } = await q.order('game_no');
  if (error) throw error;

  const games: WarehouseGame[] = [];
  for (const row of data ?? []) {
    const price = Number((row as any).price) || 0;
    const pieces = packPieces(price, (row as any).pack_pieces);
    // Χωρίς ορισμένο μέγεθος πακέτου δεν υπάρχει ούτε αξία ούτε πλήθος
    // δελτίων - και ένα επινοημένο θα χρέωνε δελτία που δεν υπήρξαν.
    if (pieces === null) continue;
    games.push({
      gameNo: String((row as any).game_no).trim(),
      catalogCode: (row as any).code,
      name: (row as any).name,
      price,
      pieces,
      value: packValue(price, (row as any).pack_pieces),
    });
  }
  return games;
}

export async function fetchWarehousePacks(
  orgId: string,
  storeId: string,
  statuses: PackStatus[] = ['IN_WAREHOUSE']
): Promise<WarehousePack[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('organization_id', orgId)
    .eq('store_id', storeId)
    .in('status', statuses)
    .order('received_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as WarehousePack[];
}

/**
 * Αν το κατάστημα έχει παραλάβει ποτέ πακέτο.
 *
 * Οποιαδήποτε κατάσταση μετράει - και ένα πακέτο που έχει ήδη βγει στο
 * μαγαζί ή αποσυρθεί σημαίνει ότι η αποθήκη χρησιμοποιείται. Κρίνοντας από
 * το τρέχον απόθεμα, το ταμείο ξαναζητούσε πληκτρολογημένο κωδικό κάθε
 * φορά που άδειαζε το ράφι.
 */
export async function storeUsesWarehouse(orgId: string, storeId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('store_id', storeId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export interface ReceivePackInput {
  orgId: string;
  storeId: string;
  game: WarehouseGame;
  packCode: string;
  receivedAt: string;
  userId?: string | null;
}

/**
 * Καταχωρεί παραλαβή.
 *
 * Τα pieces και η unit_price αντιγράφονται πάνω στο πακέτο αντί να
 * διαβάζονται αργότερα από τον κατάλογο: μια αλλαγή τιμής αύριο δεν αλλάζει
 * τι παρελήφθη σήμερα, και η αξία αποθήκης διαβάζεται και αναδρομικά.
 */
export async function receivePack(input: ReceivePackInput): Promise<WarehousePack> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      organization_id: input.orgId,
      store_id: input.storeId,
      game_no: input.game.gameNo,
      catalog_code: input.game.catalogCode,
      game_name: input.game.name,
      pack_code: input.packCode,
      pieces: input.game.pieces,
      unit_price: input.game.price,
      received_at: input.receivedAt,
      status: 'IN_WAREHOUSE',
      created_by: input.userId ?? null,
    })
    .select('*')
    .single();

  if (error) {
    // 23505 = μοναδικός δείκτης. Ο ίδιος κωδικός δεύτερη φορά είναι ο
    // ευκολότερος τρόπος να φουσκώσει η αξία κατά 300 € χωρίς να φανεί.
    if ((error as any).code === '23505') {
      throw new Error(
        `Το πακέτο ${input.packCode} για ${input.game.name} έχει ήδη καταχωρηθεί.`
      );
    }
    throw error;
  }
  return data as WarehousePack;
}

/** Βγαίνει στον πάγκο. Φεύγει από την αξία αποθήκης τη στιγμή που φεύγει. */
export async function movePackToStore(packId: string, shiftId?: string | null): Promise<void> {
  const { error, count } = await supabase
    .from(TABLE)
    .update(
      {
        status: 'IN_STORE',
        moved_at: new Date().toISOString(),
        moved_shift_id: shiftId ?? null,
        updated_at: new Date().toISOString(),
      },
      { count: 'exact' }
    )
    .eq('id', packId)
    .eq('status', 'IN_WAREHOUSE');
  if (error) throw error;
  // Ένα UPDATE που η RLS φιλτράρει γυρίζει 204 χωρίς σφάλμα - το έχουμε
  // πληρώσει αλλού σε αυτό το έργο. Εδώ θα σήμαινε πακέτο ανοιγμένο στον
  // πάγκο που η αποθήκη εξακολουθεί να το μετράει στο ράφι.
  const problem = rowsWrittenProblem(count);
  if (problem) {
    throw new Error('Το πακέτο δεν μεταφέρθηκε — ίσως το πήρε ήδη άλλη βάρδια. Ανανεώστε τη λίστα.');
  }
}

/**
 * Ξαναβάζει στο ράφι ένα πακέτο που αναιρέθηκε στο ταμείο.
 *
 * Το άνοιγμα το βγάζει από την αποθήκη· η αναίρεση πρέπει να το γυρίζει,
 * αλλιώς μένει IN_STORE για πάντα ενώ κανείς δεν το πούλησε - και η αξία
 * αποθήκης λείπει 300 € που βρίσκονται ακόμα στο ράφι.
 *
 * Ψάχνει με catalog_code ΚΑΙ pack_code: ο κωδικός πακέτου δεν είναι
 * μοναδικός από μόνος του. Στην αποθήκη του Owner το 1234567 υπάρχει ήδη
 * δύο φορές, στο 0163 και στο 0166 - ο μοναδικός δείκτης είναι σε
 * (οργανισμός, παιχνίδι, κωδικός), και ένα ψάξιμο μόνο με κωδικό θα
 * γύριζε λάθος πακέτο.
 */
export async function returnPackToWarehouse(
  orgId: string,
  storeId: string,
  catalogCode: string,
  packCode: string
): Promise<void> {
  const { error, count } = await supabase
    .from(TABLE)
    .update(
      {
        status: 'IN_WAREHOUSE',
        moved_at: null,
        moved_shift_id: null,
        updated_at: new Date().toISOString(),
      },
      { count: 'exact' }
    )
    .eq('organization_id', orgId)
    .eq('store_id', storeId)
    .eq('catalog_code', catalogCode)
    .eq('pack_code', packCode)
    .eq('status', 'IN_STORE');
  if (error) throw error;
  if (rowsWrittenProblem(count)) {
    throw new Error(
      `Το πακέτο ${packCode} δεν επέστρεψε στην αποθήκη — ίσως δεν είχε έρθει από εκεί.`
    );
  }
}

/** Επιστρέφει στον ΟΠΑΠ. Φεύγει από την αποθήκη χωρίς να πουληθεί. */
export async function withdrawPack(packId: string, reason: string): Promise<void> {
  const { error, count } = await supabase
    .from(TABLE)
    .update(
      {
        status: 'WITHDRAWN',
        withdrawn_at: new Date().toISOString(),
        withdrawn_reason: reason || null,
        updated_at: new Date().toISOString(),
      },
      { count: 'exact' }
    )
    .eq('id', packId)
    .eq('status', 'IN_WAREHOUSE');
  if (error) throw error;
  if (rowsWrittenProblem(count)) {
    throw new Error('Το πακέτο δεν αποσύρθηκε — ίσως έχει ήδη βγει στο μαγαζί. Ανανεώστε τη λίστα.');
  }
}
