import { supabase, handleSupabaseError, OperationType, cleanData } from './supabase.ts';
import { Supplier, SupplierOrder } from '../types/index.ts';

const SUPPLIERS_TABLE = 'suppliers';
const SUPPLIER_ORDERS_TABLE = 'supplier_orders';

export async function fetchSuppliersFromFirestore(orgId: string): Promise<Supplier[]> {
  try {
    const { data, error } = await supabase.from(SUPPLIERS_TABLE).select('*').eq('organization_id', orgId);
    if (error) throw error;
    return (data ?? []) as Supplier[];
  } catch (error) {
    await handleSupabaseError(error, OperationType.LIST, SUPPLIERS_TABLE).catch(() => {});
    return [];
  }
}

export async function createSupplierInFirestore(supData: Omit<Supplier, 'id'>): Promise<Supplier> {
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from(SUPPLIERS_TABLE)
      .insert(cleanData({ ...supData, created_at: nowIso, updated_at: nowIso }))
      .select()
      .single();
    if (error) throw error;
    return data as Supplier;
  } catch (error) {
    await handleSupabaseError(error, OperationType.CREATE, SUPPLIERS_TABLE);
    throw error;
  }
}

export async function updateSupplierInFirestore(supplierId: string, updateData: Partial<Supplier>): Promise<void> {
  try {
    const { error } = await supabase.from(SUPPLIERS_TABLE).update(cleanData({
      ...updateData,
      updated_at: new Date().toISOString(),
    })).eq('id', supplierId);
    if (error) throw error;
  } catch (error) {
    await handleSupabaseError(error, OperationType.UPDATE, `${SUPPLIERS_TABLE}/${supplierId}`);
    throw error;
  }
}

export async function deleteSupplierInFirestore(supplierId: string): Promise<void> {
  try {
    const { error } = await supabase.from(SUPPLIERS_TABLE).delete().eq('id', supplierId);
    if (error) throw error;
  } catch (error) {
    await handleSupabaseError(error, OperationType.DELETE, `${SUPPLIERS_TABLE}/${supplierId}`);
    throw error;
  }
}

export async function fetchSupplierOrdersFromFirestore(orgId: string): Promise<SupplierOrder[]> {
  try {
    const { data, error } = await supabase.from(SUPPLIER_ORDERS_TABLE).select('*').eq('organization_id', orgId);
    if (error) throw error;
    return (data ?? []) as SupplierOrder[];
  } catch (error) {
    await handleSupabaseError(error, OperationType.LIST, SUPPLIER_ORDERS_TABLE).catch(() => {});
    return [];
  }
}

export async function createSupplierOrderInFirestore(orderData: Omit<SupplierOrder, 'id' | 'created_at'>): Promise<SupplierOrder> {
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from(SUPPLIER_ORDERS_TABLE)
      .insert(cleanData({ ...orderData, created_at: nowIso }))
      .select()
      .single();
    if (error) throw error;
    return data as SupplierOrder;
  } catch (error) {
    await handleSupabaseError(error, OperationType.CREATE, SUPPLIER_ORDERS_TABLE);
    throw error;
  }
}

export async function updateSupplierOrderStatusInFirestore(orderId: string, status: SupplierOrder['status']): Promise<void> {
  try {
    const { error } = await supabase.from(SUPPLIER_ORDERS_TABLE).update({ status }).eq('id', orderId);
    if (error) throw error;
  } catch (error) {
    await handleSupabaseError(error, OperationType.UPDATE, `${SUPPLIER_ORDERS_TABLE}/${orderId}`);
    throw error;
  }
}
