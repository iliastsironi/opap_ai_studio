import { supabase } from './supabase.ts';
import { packPieces, packValue } from '../lib/scratchBarcode.ts';
import { rowsWrittenProblem } from '../lib/writeGuard.ts';
import { positionKey, type ProgressRow } from '../lib/packProgress.ts';

/**
 * Η αποθήκη των σκρατς: τι παρελήφθη, τι περιμένει, τι βγήκε.
 *
 * Ξεχωριστή ανά κατάστημα. Ένα πακέτο ανήκει σε ένα κατάστημα από τη
 * στιγμή της παραλαβής και δεν μετακινείται σε άλλο - αν χρειαστεί, είναι
 * απόσυρση από το ένα και παραλαβή στο άλλο, που είναι και ό,τι συμβαίνει
 * στην πραγματικότητα.
 */

const TABLE = 'scratch_warehouse_packs';

/**
 * Πού βρίσκεται ένα πακέτο.
 *
 *   IN_WAREHOUSE      στην αποθήκη, στο ράφι
 *   PENDING_DELIVERY  παραδόθηκε στο κατάστημα, δεν άνοιξε ακόμα
 *   IN_STORE          το άνοιξε το ταμείο, πουλάει
 *   WITHDRAWN         επέστρεψε στον ΟΠΑΠ
 *
 * Η μεσαία προστέθηκε στο 0076. Χωρίς αυτήν, το «άνοιγμα νέου πακέτου»
 * πρόσφερε στον υπάλληλο ολόκληρη την αποθήκη για να διαλέξει το πακέτο
 * που κρατούσε στο χέρι.
 */
export type PackStatus = 'IN_WAREHOUSE' | 'PENDING_DELIVERY' | 'IN_STORE' | 'WITHDRAWN';

/** Οι θέσεις ενός πακέτου που δεν έχει ανοίξει - απόθεμα, όπου κι αν κάθεται. */
export const UNOPENED_STATUSES: PackStatus[] = ['IN_WAREHOUSE', 'PENDING_DELIVERY'];

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
  /** Πότε το παρέδωσε ο αντμιν στο κατάστημα. */
  delivered_at: string | null;
  /** Πότε το άνοιξε το ταμείο - άλλο γεγονός, άλλη ώρα. */
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

/**
 * Τα πακέτα του καταστήματος στις θέσεις που ζητήθηκαν.
 *
 * Οι θέσεις δηλώνονται πάντα. Υπήρχε προεπιλογή ['IN_WAREHOUSE'], και με
 * τέσσερις θέσεις αντί για τρεις μια παραλειμμένη παράμετρος θα έδινε
 * σιωπηλά το ράφι σε κάποιον που ρωτούσε τι έχει παραδοθεί.
 */
export async function fetchWarehousePacks(
  orgId: string,
  storeId: string,
  statuses: PackStatus[]
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

/**
 * Πού βρίσκεται κάθε πακέτο που τρέχει στον πάγκο.
 *
 * Τίποτα καινούριο δεν αποθηκεύεται: η θέση ζει ήδη στις γραμμές των
 * βαρδιών. Κάθε βάρδια ξεκινάει από εκεί που τελείωσε η προηγούμενη, οπότε
 * η πιο πρόσφατη γραμμή που κρατάει αυτόν τον κωδικό πακέτου έχει την
 * τρέχουσα θέση.
 *
 * Οι βάρδιες διαβάζονται με φθίνουσα σειρά και κρατιέται η πρώτη που
 * ταιριάζει - η πρώτη είναι η πιο πρόσφατη. Το όριο των 60 είναι γενναιόδωρο
 * για ένα πακέτο που τρέχει: αν χρειάστηκαν περισσότερες βάρδιες για να
 * πουληθεί, η πρόοδός του δεν είναι η πληροφορία που λείπει.
 */
export async function fetchPackPositions(
  orgId: string,
  storeId: string
): Promise<Record<string, ProgressRow>> {
  const { data, error } = await supabase
    .from('shifts')
    .select('opened_at,custom_field_values')
    .eq('organization_id', orgId)
    .eq('store_id', storeId)
    .order('opened_at', { ascending: false })
    .limit(60);
  if (error) throw error;

  // Κλειδί: παιχνίδι ΚΑΙ κωδικός. Ο κωδικός μόνος του δεν ξεχωρίζει πακέτο -
  // το 1234567 υπάρχει σε δέκα παιχνίδια, και ένας χάρτης με σκέτο κωδικό
  // απαντούσε στο καθένα την πρόοδο ενός άλλου. Δες lib/packProgress.ts.
  const byCode: Record<string, ProgressRow> = {};
  for (const shift of data ?? []) {
    const rows = (shift as any).custom_field_values?.scratch_ticket_items ?? [];
    for (const row of rows) {
      const code = String(row?.packCode ?? '').trim();
      if (!code) continue;
      // Η γραμμή ΞΕΡΕΙ σε ποιο παιχνίδι ανήκει: το id της είναι ο κωδικός
      // του καταλόγου, ο ίδιος που κουβαλάει το πακέτο ως catalog_code.
      const key = positionKey(row?.id, code);
      // Η πρώτη που συναντάμε είναι η πιο πρόσφατη· οι παλιότερες αγνοούνται.
      if (byCode[key]) continue;
      byCode[key] = {
        startNo: row.startNo,
        endNo: row.endNo,
        backStartNo: row.backStartNo,
        backEndNo: row.backEndNo,
      };
    }
  }
  return byCode;
}

/**
 * Ό,τι χρειάζεται το ταμείο για να ανοίξει πακέτο.
 *
 * Και οι δύο θέσεις του απούλητου, όχι μόνο το παραδομένο: τα παραδομένα
 * είναι αυτά που προσφέρονται, αλλά χωρίς τα υπόλοιπα η οθόνη δεν μπορεί
 * να ξεχωρίσει το «δεν σου παρέδωσε κανείς αυτό το παιχνίδι» από το «δεν
 * υπάρχει πουθενά» - και το πρώτο είναι ένα κλικ του αντμιν, το δεύτερο
 * παραγγελία στον ΟΠΑΠ.
 */
export async function fetchPacksForTill(orgId: string, storeId: string): Promise<WarehousePack[]> {
  return fetchWarehousePacks(orgId, storeId, UNOPENED_STATUSES);
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

/**
 * Ο αντμιν το παραδίδει στο κατάστημα.
 *
 * Το πακέτο φεύγει από το ράφι αλλά δεν έχει ανοίξει: από εδώ και πέρα
 * είναι το μόνο που προσφέρεται στο ταμείο για αυτό το παιχνίδι. Μένει
 * απόθεμα - τα 90 ημέρες τρέχουν, η απόσυρση και η διόρθωση ισχύουν - και
 * γι' αυτό η αξία του δεν λείπει από καμία οθόνη.
 */
export async function deliverPackToStore(packId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error, count } = await supabase
    .from(TABLE)
    .update({ status: 'PENDING_DELIVERY', delivered_at: now, updated_at: now }, { count: 'exact' })
    .eq('id', packId)
    .eq('status', 'IN_WAREHOUSE');
  if (error) throw error;
  if (rowsWrittenProblem(count)) {
    throw new Error('Το πακέτο δεν παραδόθηκε — ίσως το πρόλαβε κάποιος. Ανανεώστε τη λίστα.');
  }
}

/**
 * Πίσω στο ράφι - η παράδοση πατήθηκε σε λάθος πακέτο.
 *
 * Υπάρχει επειδή η παράδοση είναι ένα κλικ πάνω σε μια λίστα 42 πακέτων.
 * Μια πόρτα χωρίς επιστροφή θα άφηνε τον αντμιν με δύο κακές επιλογές:
 * να αφήσει το λάθος όπως είναι, ή να πει στον υπάλληλο να «παραλάβει»
 * κάτι που δεν πήρε ποτέ στα χέρια του.
 */
export async function cancelDelivery(packId: string): Promise<void> {
  const { error, count } = await supabase
    .from(TABLE)
    .update(
      { status: 'IN_WAREHOUSE', delivered_at: null, updated_at: new Date().toISOString() },
      { count: 'exact' }
    )
    .eq('id', packId)
    .eq('status', 'PENDING_DELIVERY');
  if (error) throw error;
  if (rowsWrittenProblem(count)) {
    throw new Error('Η παράδοση δεν ακυρώθηκε — ίσως το πακέτο άνοιξε ήδη στο ταμείο.');
  }
}

/**
 * Ο υπάλληλος το παραλαμβάνει και το ανοίγει στον πάγκο.
 *
 * Μόνο από το «προς παράδοση». Πριν το 0076 έβγαινε κατευθείαν από το
 * ράφι, που σήμαινε ότι το ταμείο μπορούσε να ανοίξει πακέτο το οποίο
 * καθόταν ακόμα στην αποθήκη - ένα κλικ, και η αποθήκη χρωστούσε 300 €
 * που κανείς δεν είχε κουβαλήσει.
 */
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
    .eq('status', 'PENDING_DELIVERY');
  if (error) throw error;
  // Ένα UPDATE που η RLS φιλτράρει γυρίζει 204 χωρίς σφάλμα - το έχουμε
  // πληρώσει αλλού σε αυτό το έργο. Εδώ θα σήμαινε πακέτο ανοιγμένο στον
  // πάγκο που η αποθήκη εξακολουθεί να το μετράει στο ράφι.
  const problem = rowsWrittenProblem(count);
  if (problem) {
    throw new Error(
      'Το πακέτο δεν παραλήφθηκε — ίσως το άνοιξε ήδη άλλη βάρδια, ή ακυρώθηκε η παράδοσή του. Ανανεώστε τη λίστα.'
    );
  }
}

/**
 * Αναιρεί την παραλαβή ενός πακέτου στο ταμείο.
 *
 * Το άνοιγμα το βγάζει από το απόθεμα· η αναίρεση πρέπει να το γυρίζει,
 * αλλιώς μένει IN_STORE για πάντα ενώ κανείς δεν το πούλησε - και η αξία
 * αποθήκης λείπει 300 € που βρίσκονται ακόμα στο μαγαζί.
 *
 * Γυρίζει στο «προς παράδοση» και όχι στο ράφι: το πακέτο είναι ΦΥΣΙΚΑ
 * στο μαγαζί, παραδομένο, και μια επιστροφή στο ράφι θα έλεγε ψέματα για
 * το πού βρίσκεται - ο αντμιν θα το έβλεπε στην αποθήκη και θα το
 * παρέδιδε δεύτερη φορά.
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
        status: 'PENDING_DELIVERY',
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
      `Το πακέτο ${packCode} δεν επέστρεψε — ίσως δεν είχε έρθει από την αποθήκη.`
    );
  }
}

/**
 * Ξαναβάζει στο ράφι όλα τα πακέτα που είχε βγάλει μια βάρδια.
 *
 * Η διαγραφή βάρδιας σβήνει τις γραμμές που κρατούσαν τα πακέτα και
 * μηδενίζει το moved_shift_id - το ξένο κλειδί είναι ON DELETE SET NULL.
 * Τα πακέτα όμως έμεναν IN_STORE: καμία βάρδια δεν τα κρατούσε πια, και η
 * αποθήκη εξακολουθούσε να τα θεωρεί στον πάγκο. Τρία πακέτα, 1.350 €,
 * χάθηκαν έτσι την πρώτη μέρα.
 *
 * ΠΡΙΝ τη διαγραφή, για τον ίδιο λόγο που και οι χρεώσεις πελατών: μόλις
 * φύγει η βάρδια, το moved_shift_id είναι NULL και δεν υπάρχει πια τρόπος
 * να βρεθεί ποια πακέτα ήταν δικά της.
 */
export async function returnPacksFromShift(shiftId: string): Promise<number> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      // Παραδομένα, όπως και στην αναίρεση: η βάρδια έφυγε, το πακέτο δεν
      // μετακινήθηκε από το μαγαζί.
      status: 'PENDING_DELIVERY',
      moved_at: null,
      moved_shift_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('moved_shift_id', shiftId)
    .eq('status', 'IN_STORE')
    .select('id');
  if (error) throw error;
  return (data ?? []).length;
}

/** Πόσα πακέτα θα επιστρέψουν αν σβηστεί αυτή η βάρδια. */
export async function countPacksFromShift(shiftId: string): Promise<number> {
  const { count, error } = await supabase
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('moved_shift_id', shiftId)
    .eq('status', 'IN_STORE');
  if (error) throw error;
  return count ?? 0;
}

/**
 * Αναιρεί την παραλαβή ενός πακέτου που δεν πούλησε τίποτα.
 *
 * Η διέξοδος για ό,τι ξέφυγε: πακέτο που έμεινε ορφανό από διαγραμμένη
 * βάρδια, λάθος κλικ, ή οποιοδήποτε κενό δεν έχει βρεθεί ακόμα. Ο έλεγχος
 * «δεν πούλησε τίποτα» γίνεται στην οθόνη, που ξέρει τη θέση του πακέτου -
 * εδώ αρκεί ότι είναι IN_STORE.
 */
export async function returnPackById(packId: string): Promise<void> {
  const { error, count } = await supabase
    .from(TABLE)
    .update(
      { status: 'PENDING_DELIVERY', moved_at: null, moved_shift_id: null, updated_at: new Date().toISOString() },
      { count: 'exact' }
    )
    .eq('id', packId)
    .eq('status', 'IN_STORE');
  if (error) throw error;
  if (rowsWrittenProblem(count)) {
    throw new Error('Η παραλαβή δεν αναιρέθηκε — ίσως κάποιος το πρόλαβε. Ανανεώστε τη λίστα.');
  }
}

/**
 * Σβήνει πακέτο που δεν υπήρξε ποτέ.
 *
 * Λόγια του ιδιοκτήτη: «υπάρχουνε πολλά σκρατς τα οποία έχουνε τους τεστ
 * κωδικούς και δεν μπορώ να τα σβήσω από την αποθήκη». Δεν μπορούσε, και
 * δεν ήταν δική του αστοχία: η μόνη έξοδος ήταν η «Απόσυρση», που ανοίγει
 * στις 90 ημέρες από την παραλαβή. Στη Λαμία κάθονται 26 πακέτα με κωδικό
 * 1234567, 1111111, 0000000 - καταχωρήσεις δοκιμής που δεν αντιστοιχούν σε
 * χαρτί, και που κάθε μέρα μετράνε στην αξία αποθήκης.
 *
 * ΓΙΑΤΙ ΔΙΑΓΡΑΦΗ ΚΑΙ ΟΧΙ ΑΠΟΣΥΡΣΗ. Είναι δύο διαφορετικά γεγονότα και η
 * διαφορά τους είναι λογιστική, όχι γούστου: η απόσυρση λέει «αυτό το
 * χαρτί γύρισε στον ΟΠΑΠ» - μια πράξη με ημερομηνία, αιτία και αξία που
 * φεύγει από το απόθεμα. Η διαγραφή λέει «αυτή η γραμμή δεν έπρεπε να
 * γραφτεί». Αν τα δοκιμαστικά «αποσυρθούν», η αποθήκη θα δείχνει για
 * πάντα 26 επιστροφές στον ΟΠΑΠ που δεν έγιναν ποτέ.
 *
 * ΧΩΡΙΣ ΦΙΛΤΡΟ ΚΑΤΑΣΤΑΣΗΣ, επίτηδες - αντίθετα από το correctPack. Τα
 * δοκιμαστικά είναι όλα «στο μαγαζί», δηλαδή ακριβώς στη θέση που δεν έχει
 * καμία έξοδο σήμερα· ένα .in('status', UNOPENED_STATUSES) εδώ θα άφηνε
 * άλυτο το πρόβλημα που λύνει. Το ίχνος γράφεται από τον trigger
 * (WAREHOUSE_PACK_DELETED, 0065/0076) πριν χαθεί η γραμμή, και το δικαίωμα
 * το κρίνει η πολιτική warehouse_delete.
 */
export async function deletePackById(packId: string): Promise<void> {
  const { error, count } = await supabase
    .from(TABLE)
    .delete({ count: 'exact' })
    .eq('id', packId);
  if (error) throw error;
  // Η RLS δεν σφάλλει: φιλτράρει τη γραμμή και το PostgREST απαντά 204 με
  // μηδέν γραμμές. Χωρίς αυτό, μια διαγραφή που δεν έγινε θα διαβαζόταν
  // ως επιτυχία και το πακέτο θα ξαναφαινόταν στο επόμενο φόρτωμα.
  if (rowsWrittenProblem(count)) {
    throw new Error(
      'Το πακέτο δεν σβήστηκε — δεν έχετε δικαίωμα διαγραφής στην αποθήκη, ή κάποιος το πρόλαβε. Ανανεώστε τη λίστα.'
    );
  }
}

export interface CorrectPackInput {
  packId: string;
  /** Το παιχνίδι όπως είναι τώρα σωστό - ίσως άλλο από το αρχικό. */
  game: WarehouseGame;
  packCode: string;
  receivedAt: string;
}

/**
 * Διορθώνει πακέτο που καταχωρήθηκε λάθος.
 *
 * Μόνο όσο δεν έχει ανοίξει - στο ράφι ή παραδομένο. Από τη στιγμή που
 * βγαίνει στον πάγκο, ο κωδικός του είναι γραμμένος μέσα στις γραμμές των
 * βαρδιών - αλλάζοντάς τον εδώ, η πρόοδος πώλησης δεν θα έβρισκε πια το
 * πακέτο της και το ταμείο θα κρατούσε έναν κωδικό που η αποθήκη δεν έχει.
 * Το .in('status', ...) το επιβάλλει στη βάση και όχι μόνο στην οθόνη.
 *
 * Η παράδοση δεν κλείνει τη διόρθωση: ο λάθος κωδικός φαίνεται συνήθως
 * ΤΗ ΣΤΙΓΜΗ που κάποιος κρατάει το πακέτο στο χέρι και το συγκρίνει με
 * την οθόνη, δηλαδή ακριβώς αφού παραδοθεί.
 *
 * Το παιχνίδι μπορεί να αλλάξει κι αυτό: σκαναρισμένος λάθος 4ψήφιος είναι
 * το ίδιο εύκολο λάθος με λάθος κωδικό. Μαζί του αλλάζουν δελτία και τιμή,
 * αλλιώς η αξία θα έμενε αυτή του παλιού παιχνιδιού.
 */
export async function correctPack(input: CorrectPackInput): Promise<void> {
  const { error, count } = await supabase
    .from(TABLE)
    .update(
      {
        game_no: input.game.gameNo,
        catalog_code: input.game.catalogCode,
        game_name: input.game.name,
        pack_code: input.packCode,
        pieces: input.game.pieces,
        unit_price: input.game.price,
        received_at: input.receivedAt,
        updated_at: new Date().toISOString(),
      },
      { count: 'exact' }
    )
    .eq('id', input.packId)
    .in('status', UNOPENED_STATUSES);

  if (error) {
    if ((error as any).code === '23505') {
      throw new Error(`Το πακέτο ${input.packCode} για ${input.game.name} υπάρχει ήδη.`);
    }
    throw error;
  }
  if (rowsWrittenProblem(count)) {
    throw new Error('Το πακέτο δεν διορθώθηκε — ίσως το άνοιξε ήδη το ταμείο.');
  }
}

/**
 * Επιστρέφει στον ΟΠΑΠ. Φεύγει από την αποθήκη χωρίς να πουληθεί.
 *
 * Και από το «προς παράδοση»: οι 90 ημέρες μετράνε από την παραλαβή και
 * δεν σταματάνε επειδή το πακέτο πήγε στον πάγκο. Ένα ληγμένο πακέτο που
 * κάθεται παραδομένο πρέπει να μπορεί να αποσυρθεί από εκεί που είναι.
 */
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
    .in('status', UNOPENED_STATUSES);
  if (error) throw error;
  if (rowsWrittenProblem(count)) {
    throw new Error('Το πακέτο δεν αποσύρθηκε — ίσως το άνοιξε ήδη το ταμείο. Ανανεώστε τη λίστα.');
  }
}
