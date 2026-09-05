import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Save,
  Plus,
  Trash2,
  CheckCircle2,
  ToggleLeft,
  ToggleRight,
  HelpCircle,
  Lock,
  Layers,
  Calculator,
  RefreshCcw,
  Edit3,
  ArrowUp,
  ArrowDown,
  Eye,
  Euro,
  Hash,
  CheckSquare,
  FileText,
  ShieldCheck,
  AlertCircle,
  Info,
  Sparkles,
} from 'lucide-react';
import { ShiftTemplateConfig, TemplateFieldConfig } from '../../types/index.ts';
import {
  getShiftTemplateConfig,
  saveShiftTemplateConfig,
  DEFAULT_OPAP_SHIFT_TEMPLATE,
} from '../../services/shiftTemplateService.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTenant } from '../../context/TenantContext.tsx';

export const ShiftTemplateConfigurator: React.FC = () => {
  const { organization, hasPermission } = useAuth();
  const { currentStore } = useTenant();

  const [template, setTemplate] = useState<ShiftTemplateConfig>(DEFAULT_OPAP_SHIFT_TEMPLATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Active View Tab
  const [activeTab, setActiveTab] = useState<'FIELDS' | 'PREVIEW' | 'MODULES'>('FIELDS');

  // Filter in Fields Tab
  const [fieldFilter, setFieldFilter] = useState<'ALL' | 'SYSTEM' | 'CUSTOM' | 'REPORTS' | 'COUNTING'>('ALL');

  // New / Edit Custom Field Modal State
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);

  // Form Fields State for Modal
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldKey, setFieldKey] = useState('');
  const [fieldSection, setFieldSection] = useState<'REPORTS' | 'COUNTING' | 'HEADER'>('COUNTING');
  const [fieldType, setFieldType] = useState<'CURRENCY' | 'NUMBER' | 'BOOLEAN' | 'TEXT'>('CURRENCY');
  const [fieldRequired, setFieldRequired] = useState(false);
  const [fieldDescription, setFieldDescription] = useState('');
  const [fieldPlaceholder, setFieldPlaceholder] = useState('');

  // Test values for Live Preview
  const [previewValues, setPreviewValues] = useState<Record<string, any>>({
    custom_safe_drop: '250.00',
    custom_cleaning_expense: '15.00',
    custom_courier_vouchers: '4',
    custom_sanitization_check: true,
    custom_shift_note: 'Όλα pota & τερματικά λειτούργησαν κανονικά.',
  });

  const orgId = organization?.id || 'org_opap_demo';
  const storeId = currentStore?.id || 'store_opap_01';

  const canEdit = hasPermission('organization.update') || hasPermission('store.update');

  useEffect(() => {
    async function loadConfig() {
      setLoading(true);
      const loaded = await getShiftTemplateConfig(orgId, storeId);
      setTemplate(loaded);
      setLoading(false);
    }
    loadConfig();
  }, [orgId, storeId]);

  const handleToggleModule = (key: keyof ShiftTemplateConfig) => {
    if (!canEdit) return;
    setTemplate((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccessMsg(null);
    try {
      await saveShiftTemplateConfig(template);
      setSuccessMsg('Η διαμόρφωση του προτύπου βάρδιας αποθηκεύτηκε με επιτυχία!');
    } catch (err: any) {
      alert('Σφάλμα κατά την αποθήκευση: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (confirm('Θέλετε να επαναφέρετε τη φόρμα στις προεπιλεγμένες ρυθμίσεις του καταστήματος;')) {
      setTemplate({
        ...DEFAULT_OPAP_SHIFT_TEMPLATE,
        organization_id: orgId,
        store_id: storeId,
      });
      setSuccessMsg('Εγινε επαναφορά στις προεπιλογές!');
    }
  };

  const handleOpenAddField = () => {
    setEditingFieldId(null);
    setFieldLabel('');
    setFieldKey('');
    setFieldSection('COUNTING');
    setFieldType('CURRENCY');
    setFieldRequired(false);
    setFieldDescription('');
    setFieldPlaceholder('');
    setShowFieldModal(true);
  };

  const handleOpenEditField = (field: TemplateFieldConfig) => {
    if (field.isSystemManaged) return; // System fields are not directly editable in modal
    setEditingFieldId(field.id);
    setFieldLabel(field.label);
    setFieldKey(field.key);
    setFieldSection(field.section as any);
    setFieldType((field.type === 'SYSTEM_MANAGED' || field.type === 'FORMULA') ? 'CURRENCY' : field.type);
    setFieldRequired(field.required);
    setFieldDescription(field.description || '');
    setFieldPlaceholder(field.placeholder || '');
    setShowFieldModal(true);
  };

  const handleSaveFieldFromModal = () => {
    if (!fieldLabel.trim()) {
      alert('Παρακαλώ εισάγετε όνομα/ετικέτα πεδίου.');
      return;
    }

    const keyToUse = fieldKey.trim()
      ? fieldKey.trim().toLowerCase().replace(/\s+/g, '_')
      : `custom_${Date.now()}`;

    if (editingFieldId) {
      // Edit existing
      setTemplate((prev) => ({
        ...prev,
        custom_fields: (prev.custom_fields || []).map((f) => {
          if (f.id === editingFieldId) {
            return {
              ...f,
              label: fieldLabel.trim(),
              key: keyToUse,
              section: fieldSection,
              type: fieldType,
              required: fieldRequired,
              description: fieldDescription.trim(),
              placeholder: fieldPlaceholder.trim(),
            };
          }
          return f;
        }),
      }));
    } else {
      // Add new custom field
      const newFieldConfig: TemplateFieldConfig = {
        id: `field_${Date.now()}`,
        key: keyToUse,
        label: fieldLabel.trim(),
        section: fieldSection,
        type: fieldType,
        isSystemManaged: false,
        enabled: true,
        required: fieldRequired,
        description: fieldDescription.trim(),
        placeholder: fieldPlaceholder.trim(),
        order: (template.custom_fields || []).length + 1,
      };

      setTemplate((prev) => ({
        ...prev,
        custom_fields: [...(prev.custom_fields || []), newFieldConfig],
      }));
    }

    setShowFieldModal(false);
  };

  const handleToggleFieldEnabled = (fieldId: string) => {
    setTemplate((prev) => ({
      ...prev,
      custom_fields: (prev.custom_fields || []).map((f) =>
        f.id === fieldId ? { ...f, enabled: !f.enabled } : f
      ),
    }));
  };

  const handleToggleFieldRequired = (fieldId: string) => {
    setTemplate((prev) => ({
      ...prev,
      custom_fields: (prev.custom_fields || []).map((f) =>
        f.id === fieldId ? { ...f, required: !f.required } : f
      ),
    }));
  };

  const handleRemoveCustomField = (id: string) => {
    const field = template.custom_fields?.find((f) => f.id === id);
    if (field?.isSystemManaged) {
      alert('Τα συστημικά πεδία δεν μπορούν να διαγραφούν. Μπορείτε να τα απενεργοποιήσετε.');
      return;
    }
    setTemplate((prev) => ({
      ...prev,
      custom_fields: (prev.custom_fields || []).filter((f) => f.id !== id),
    }));
  };

  const handleMoveField = (index: number, direction: 'UP' | 'DOWN') => {
    const fields = [...(template.custom_fields || [])];
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= fields.length) return;

    const temp = fields[index];
    fields[index] = fields[targetIndex];
    fields[targetIndex] = temp;

    // re-assign order
    const updated = fields.map((f, idx) => ({ ...f, order: idx + 1 }));

    setTemplate((prev) => ({
      ...prev,
      custom_fields: updated,
    }));
  };

  const customFieldsList = template.custom_fields || [];

  const filteredFields = customFieldsList.filter((f) => {
    if (fieldFilter === 'SYSTEM') return f.isSystemManaged || f.type === 'SYSTEM_MANAGED';
    if (fieldFilter === 'CUSTOM') return !f.isSystemManaged && f.type !== 'SYSTEM_MANAGED';
    if (fieldFilter === 'REPORTS') return f.section === 'REPORTS';
    if (fieldFilter === 'COUNTING') return f.section === 'COUNTING';
    return true;
  });

  const renderTypeBadge = (type: TemplateFieldConfig['type'], isSys?: boolean) => {
    if (isSys || type === 'SYSTEM_MANAGED' || type === 'FORMULA') {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-300 shadow-2xs">
          <Lock className="w-3 h-3 text-indigo-600" />
          <span>Συστημικό - Αυτόματος Υπολογισμός</span>
        </span>
      );
    }
    switch (type) {
      case 'CURRENCY':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <Euro className="w-3 h-3 text-emerald-600" />
            <span>Ποσό σε Ευρώ (€)</span>
          </span>
        );
      case 'NUMBER':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-300">
            <Hash className="w-3 h-3 text-blue-600" />
            <span>Αριθμός</span>
          </span>
        );
      case 'BOOLEAN':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
            <CheckSquare className="w-3 h-3 text-amber-600" />
            <span>Διακόπτης (Ναι/Όχι)</span>
          </span>
        );
      case 'TEXT':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-slate-200 text-slate-800 border border-slate-300">
            <FileText className="w-3 h-3 text-slate-600" />
            <span>Κείμενο / Σημείωση</span>
          </span>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500 font-medium space-y-3">
        <RefreshCcw className="w-6 h-6 animate-spin mx-auto text-indigo-600" />
        <p className="text-sm">Φόρτωση διαμόρφωσης φόρμας βάρδιας...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <span className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl shrink-0">
              <Sliders className="w-6 h-6" />
            </span>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Διαμόρφωση Φόρμας Βάρδιας
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Απλή διαχείριση ενοτήτων & πρόσθετων πεδίων για τους υπαλλήλους του καταστήματος.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              onClick={handleResetDefaults}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-bold text-xs shadow-2xs transition-all cursor-pointer"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
              <span>Επαναφορά</span>
            </button>

            <button
              onClick={handleSave}
              disabled={saving || !canEdit}
              className="flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Αποθήκευση...' : 'Αποθήκευση Αλλαγών'}</span>
            </button>
          </div>
        </div>

        {/* Automatic Math Reassurance Badge */}
        <div className="bg-indigo-50/80 border border-indigo-200/90 rounded-xl p-3 text-xs text-indigo-950 flex items-start space-x-2.5">
          <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-extrabold text-indigo-900">⚡ Σταθεροί & Αυτόματοι Υπολογισμοί: </span>
            <span className="text-indigo-800">
              Οι μαθηματικοί τύποι (Καθαρά ΟΠΑΠ, Σκρατς, VLTs, Αποκλίσεις Ταμείου & Καταμετρήσεις) υπολογίζονται <strong>αυτόματα</strong> από το σύστημα. Εσείς απλά επιλέγετε ποιες ενότητες και ποια προαιρετικά πεδία θα είναι διαθέσιμα στη φόρμα.
            </span>
          </div>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold ml-4 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Mode Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('FIELDS')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              activeTab === 'FIELDS'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Calculator className="w-4 h-4" />
            <span>📋 Πεδία Φόρμας</span>
            <span className="px-2 py-0.5 rounded-full bg-indigo-500 text-white text-[10px] font-mono">
              {customFieldsList.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('MODULES')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              activeTab === 'MODULES'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>⚙️ Ενότητες OPAP</span>
          </button>

          <button
            onClick={() => setActiveTab('PREVIEW')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              activeTab === 'PREVIEW'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Eye className="w-4 h-4" />
            <span>👁️ Προεπισκόπηση Υπαλλήλου</span>
          </button>
        </div>

        {activeTab === 'FIELDS' && (
          <button
            onClick={handleOpenAddField}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm transition-all cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Προσθήκη Πεδίου</span>
          </button>
        )}
      </div>

      {/* TAB 1: FIELDS BUILDER */}
      {activeTab === 'FIELDS' && (
        <div className="space-y-4">
          {/* Filter Pills */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200">
            <div className="flex items-center space-x-1.5 overflow-x-auto text-xs">
              <span className="text-slate-400 font-bold px-2">Φίλτρο:</span>
              {[
                { id: 'ALL', label: 'Όλα' },
                { id: 'SYSTEM', label: '🔒 Αυτόματα (Συστημικά)' },
                { id: 'CUSTOM', label: '✍️ Υπαλλήλων (Προς συμπλήρωση)' },
                { id: 'REPORTS', label: '📊 Αναφορές (Αριστερά)' },
                { id: 'COUNTING', label: '💵 Καταμέτρηση (Δεξιά)' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFieldFilter(f.id as any)}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
                    fieldFilter === f.id
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="text-[11px] text-slate-500 font-medium">
              Εμφάνιση {filteredFields.length} από {customFieldsList.length} πεδία
            </div>
          </div>

          {/* Fields List */}
          <div className="space-y-3">
            {filteredFields.length === 0 ? (
              <div className="p-8 text-center bg-white border border-dashed border-slate-200 rounded-2xl text-slate-500 text-xs">
                Δεν βρέθηκαν πεδία για το επιλεγμένο φίλτρο.
              </div>
            ) : (
              filteredFields.map((field, idx) => {
                const isSystem = field.isSystemManaged || field.type === 'SYSTEM_MANAGED';

                return (
                  <div
                    key={field.id}
                    className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                      isSystem
                        ? 'bg-gradient-to-r from-indigo-50/70 via-white to-slate-50/80 border-indigo-200/90 shadow-2xs'
                        : field.enabled
                        ? 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                        : 'bg-slate-50 border-slate-200 opacity-60'
                    }`}
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-extrabold text-sm text-slate-900">{field.label}</span>
                        {renderTypeBadge(field.type, isSystem)}
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200">
                          Ενότητα: {field.section === 'REPORTS' ? 'Αναφορές' : 'Καταμέτρηση / Έξοδα'}
                        </span>
                        {field.required && (
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-100 text-rose-700 rounded border border-rose-200">
                            Υποχρεωτικό
                          </span>
                        )}
                      </div>

                      {field.description && (
                        <p className="text-xs text-slate-500 flex items-center space-x-1">
                          <Info className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                          <span>{field.description}</span>
                        </p>
                      )}
                    </div>

                    {/* Actions & Toggles */}
                    <div className="flex items-center space-x-2 border-t md:border-t-0 pt-2 md:pt-0 border-slate-100">
                      {/* Reorder Buttons */}
                      <div className="flex flex-col space-y-0.5">
                        <button
                          onClick={() => handleMoveField(idx, 'UP')}
                          disabled={idx === 0}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                          title="Μετακίνηση Πάνω"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleMoveField(idx, 'DOWN')}
                          disabled={idx === filteredFields.length - 1}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                          title="Μετακίνηση Κάτω"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Enabled Toggle */}
                      <button
                        onClick={() => handleToggleFieldEnabled(field.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                          field.enabled
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}
                      >
                        {field.enabled ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Ενεργό</span>
                          </>
                        ) : (
                          <span>Ανενεργό</span>
                        )}
                      </button>

                      {!isSystem ? (
                        <>
                          <button
                            onClick={() => handleToggleFieldRequired(field.id)}
                            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              field.required
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                            title="Εναλλαγή Υποχρεωτικού Πεδίου"
                          >
                            {field.required ? 'Υποχρ.' : 'Προαιρ.'}
                          </button>

                          <button
                            onClick={() => handleOpenEditField(field)}
                            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer"
                            title="Επεξεργασία Πεδίου"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleRemoveCustomField(field.id)}
                            className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                            title="Διαγραφή Πεδίου"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <span className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-bold rounded-xl flex items-center space-x-1">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Προστατευμένο</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 2: INTERACTIVE LIVE PREVIEW */}
      {activeTab === 'PREVIEW' && (
        <div className="bg-slate-900 rounded-3xl p-6 text-white space-y-6 shadow-xl border border-slate-800">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-sm">
                <Eye className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">
                  Ζωντανή Προεπισκόπηση Υπαλλήλου (Employee Closing Preview)
                </h3>
                <p className="text-xs text-slate-400">
                  Έτσι εμφανίζεται η φόρμα κλεισίματος βάρδιας στους υπαλλήλους με τα ενεργά συστημικά & προσαρμοσμένα πεδία.
                </p>
              </div>
            </div>

            <span className="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-3 py-1 rounded-full border border-emerald-500/30 flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Interactive Live Preview</span>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* LEFT COLUMN: REPORTS */}
            <div className="space-y-4 bg-slate-950/60 p-5 rounded-2xl border border-slate-800">
              <h4 className="text-xs font-extrabold text-indigo-400 tracking-wider flex items-center space-x-2">
                <Calculator className="w-4 h-4" />
                <span>ΑΝΑΦΟΡΕΣ & ΠΩΛΗΣΕΙΣ (LEFT COLUMN)</span>
              </h4>

              {customFieldsList
                .filter((f) => f.enabled && f.section === 'REPORTS')
                .map((field) => (
                  <div key={field.id} className="space-y-1 bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-200">
                        {field.label} {field.required && <span className="text-rose-400">*</span>}
                      </label>
                      {field.isSystemManaged && (
                        <span className="text-[10px] font-bold text-indigo-400 bg-indigo-950 px-2 py-0.5 rounded border border-indigo-800 flex items-center space-x-1">
                          <Lock className="w-3 h-3" />
                          <span>Συστημικό</span>
                        </span>
                      )}
                    </div>

                    {field.description && (
                      <p className="text-[11px] text-slate-400">{field.description}</p>
                    )}

                    {field.type === 'CURRENCY' ? (
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          placeholder={field.placeholder || '0.00'}
                          value={previewValues[field.key] || ''}
                          onChange={(e) =>
                            setPreviewValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-right font-mono font-bold text-emerald-400 focus:outline-none focus:border-indigo-500"
                        />
                        <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-bold">€</span>
                      </div>
                    ) : field.type === 'NUMBER' ? (
                      <input
                        type="number"
                        placeholder={field.placeholder || '0'}
                        value={previewValues[field.key] || ''}
                        onChange={(e) =>
                          setPreviewValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-right font-mono font-bold text-white focus:outline-none focus:border-indigo-500"
                      />
                    ) : field.type === 'BOOLEAN' ? (
                      <button
                        onClick={() =>
                          setPreviewValues((prev) => ({
                            ...prev,
                            [field.key]: !prev[field.key],
                          }))
                        }
                        className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-between cursor-pointer transition-all ${
                          previewValues[field.key]
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        <span>{previewValues[field.key] ? 'ΝΑΙ - Επιβεβαιώθηκε' : 'ΟΧΙ - Εκκρεμεί'}</span>
                        <CheckSquare className="w-4 h-4" />
                      </button>
                    ) : field.type === 'SYSTEM_MANAGED' ? (
                      <div className="w-full bg-indigo-950/80 border border-indigo-800 rounded-xl px-3 py-2 text-right font-mono font-black text-indigo-300">
                        1,248.50 € (Αυτόματος υπολογισμός)
                      </div>
                    ) : (
                      <input
                        type="text"
                        placeholder={field.placeholder || 'Εισάγετε σημείωση...'}
                        value={previewValues[field.key] || ''}
                        onChange={(e) =>
                          setPreviewValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    )}
                  </div>
                ))}
            </div>

            {/* RIGHT COLUMN: COUNTING & OUTFLOWS */}
            <div className="space-y-4 bg-slate-950/60 p-5 rounded-2xl border border-slate-800">
              <h4 className="text-xs font-extrabold text-emerald-400 tracking-wider flex items-center space-x-2">
                <Euro className="w-4 h-4" />
                <span>ΚΑΤΑΜΕΤΡΗΣΗ & ΕΞΟΔΑ (RIGHT COLUMN)</span>
              </h4>

              {customFieldsList
                .filter((f) => f.enabled && f.section === 'COUNTING')
                .map((field) => (
                  <div key={field.id} className="space-y-1 bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-200">
                        {field.label} {field.required && <span className="text-rose-400">*</span>}
                      </label>
                      {field.isSystemManaged && (
                        <span className="text-[10px] font-bold text-indigo-400 bg-indigo-950 px-2 py-0.5 rounded border border-indigo-800 flex items-center space-x-1">
                          <Lock className="w-3 h-3" />
                          <span>Συστημικό</span>
                        </span>
                      )}
                    </div>

                    {field.description && (
                      <p className="text-[11px] text-slate-400">{field.description}</p>
                    )}

                    {field.type === 'CURRENCY' ? (
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          placeholder={field.placeholder || '0.00'}
                          value={previewValues[field.key] || ''}
                          onChange={(e) =>
                            setPreviewValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-right font-mono font-bold text-emerald-400 focus:outline-none focus:border-indigo-500"
                        />
                        <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-bold">€</span>
                      </div>
                    ) : field.type === 'NUMBER' ? (
                      <input
                        type="number"
                        placeholder={field.placeholder || '0'}
                        value={previewValues[field.key] || ''}
                        onChange={(e) =>
                          setPreviewValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-right font-mono font-bold text-white focus:outline-none focus:border-indigo-500"
                      />
                    ) : field.type === 'BOOLEAN' ? (
                      <button
                        onClick={() =>
                          setPreviewValues((prev) => ({
                            ...prev,
                            [field.key]: !prev[field.key],
                          }))
                        }
                        className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-between cursor-pointer transition-all ${
                          previewValues[field.key]
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        <span>{previewValues[field.key] ? 'ΝΑΙ - Επιβεβαιώθηκε' : 'ΟΧΙ - Εκκρεμεί'}</span>
                        <CheckSquare className="w-4 h-4" />
                      </button>
                    ) : field.type === 'SYSTEM_MANAGED' ? (
                      <div className="w-full bg-indigo-950/80 border border-indigo-800 rounded-xl px-3 py-2 text-right font-mono font-black text-indigo-300">
                        0.00 € (Απόκλιση Ταμείου)
                      </div>
                    ) : (
                      <input
                        type="text"
                        placeholder={field.placeholder || 'Εισάγετε σημείωση...'}
                        value={previewValues[field.key] || ''}
                        onChange={(e) =>
                          setPreviewValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SUBSYSTEM MODULES */}
      {activeTab === 'MODULES' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>Ενότητες & Υποσυστήματα OPAP Report</span>
            </h2>
            <span className="text-xs text-slate-500 font-medium">
              Ενεργοποίηση / Απενεργοποίηση ενοτήτων για το κατάστημα
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              {
                key: 'show_scratch' as keyof ShiftTemplateConfig,
                title: 'Ελληνικά Λαχεία & Σκρατς',
                desc: 'Πωλήσεις, Εξαργυρώσεις, Αυτόματο Καθαρό Σύνολο',
              },
              {
                key: 'show_tora' as keyof ShiftTemplateConfig,
                title: 'TORA DIRECT Terminals',
                desc: 'Πληρωμές τερματικών TORA DIRECT (#1, #2)',
              },
              {
                key: 'show_clever_point' as keyof ShiftTemplateConfig,
                title: 'Clever Point',
                desc: 'Υπόλοιπο & εισπράξεις Clever Point',
              },
              {
                key: 'show_ippodromos' as keyof ShiftTemplateConfig,
                title: 'Ιππόδρομος',
                desc: 'Υπόλοιπο ταμείου Ιπποδρόμου',
              },
              {
                key: 'show_vlts' as keyof ShiftTemplateConfig,
                title: 'VLTs (PLAY Games)',
                desc: 'Εισροές/Εκροές & Ροή μετρητών VLTs',
              },
              {
                key: 'show_pame_stoixima' as keyof ShiftTemplateConfig,
                title: 'Πάμε Στοίχημα & Virtuals',
                desc: 'Υπόλοιπο ταμείου Στοιχήματος',
              },
              {
                key: 'show_number_games' as keyof ShiftTemplateConfig,
                title: 'Αριθμοπαιχνίδια (Τζόκερ, Κίνο, Λόττο)',
                desc: 'Πωλήσεις, Ακυρώσεις, Εξαργυρώσεις, Vouchers & Αυτόματο Σύνολο',
              },
              {
                key: 'show_fnb' as keyof ShiftTemplateConfig,
                title: 'Ταμείο FnB (Καφέ / Bar)',
                desc: 'Μετρητά, POS & Έξοδα FnB',
              },
            ].map((mod) => {
              const isEnabled = Boolean(template[mod.key]);
              return (
                <div
                  key={mod.key}
                  onClick={() => handleToggleModule(mod.key)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    isEnabled
                      ? 'bg-indigo-50/50 border-indigo-200'
                      : 'bg-slate-50 border-slate-200 opacity-60'
                  }`}
                >
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">{mod.title}</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">{mod.desc}</p>
                  </div>

                  {isEnabled ? (
                    <ToggleRight className="w-6 h-6 text-indigo-600 flex-shrink-0" />
                  ) : (
                    <ToggleLeft className="w-6 h-6 text-slate-400 flex-shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal: Add or Edit Custom Field */}
      {showFieldModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">
                {editingFieldId ? 'Επεξεργασία Πεδίου Βάρδιας' : 'Προσθήκη Νέου Πεδίου Βάρδιας'}
              </h3>
              <button
                type="button"
                onClick={() => setShowFieldModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-800 block mb-1">
                  Όνομα / Ετικέτα Πεδίου <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={fieldLabel}
                  onChange={(e) => setFieldLabel(e.target.value)}
                  placeholder="π.χ. Κατάθεση Safe Drop / Έξοδα Καθαριστικών"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:border-indigo-600 text-slate-900 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-800 block mb-1">Τύπος Πεδίου:</label>
                  <select
                    value={fieldType}
                    onChange={(e) => setFieldType(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-indigo-600 font-semibold"
                  >
                    <option value="CURRENCY">💶 Χρηματικό Ποσό (€)</option>
                    <option value="NUMBER">🔢 Αριθμός (Πλήθος)</option>
                    <option value="BOOLEAN">☑️ Διακόπτης (Ναι/Όχι)</option>
                    <option value="TEXT">📝 Κείμενο / Σημείωση</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-800 block mb-1">Ενότητα Τοποθέτησης:</label>
                  <select
                    value={fieldSection}
                    onChange={(e) => setFieldSection(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-indigo-600 font-semibold"
                  >
                    <option value="COUNTING">💵 Καταμέτρηση & Έξοδα (Δεξιά)</option>
                    <option value="REPORTS">📊 Αναφορές & Πωλήσεις (Αριστερά)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-800 block mb-1">
                  Βοηθητικό Κείμενο (Description / Tooltip):
                </label>
                <input
                  type="text"
                  value={fieldDescription}
                  onChange={(e) => setFieldDescription(e.target.value)}
                  placeholder="π.χ. Ποσό που τοποθετήθηκε στο χρηματοκιβώτιο..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-indigo-600 text-slate-900"
                />
              </div>

              <div>
                <label className="font-bold text-slate-800 block mb-1">
                  Παράδειγμα / Placeholder:
                </label>
                <input
                  type="text"
                  value={fieldPlaceholder}
                  onChange={(e) => setFieldPlaceholder(e.target.value)}
                  placeholder="π.χ. 0.00"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-indigo-600 text-slate-900"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <input
                  type="checkbox"
                  id="req_check_modal"
                  checked={fieldRequired}
                  onChange={(e) => setFieldRequired(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="req_check_modal" className="font-bold text-slate-800 cursor-pointer">
                  Υποχρεωτικό πεδίο κατά το κλείσιμο βάρδιας
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowFieldModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Ακύρωση
              </button>
              <button
                type="button"
                onClick={handleSaveFieldFromModal}
                className="px-5 py-2 text-xs font-extrabold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm cursor-pointer"
              >
                {editingFieldId ? 'Ενημέρωση' : 'Προσθήκη'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
