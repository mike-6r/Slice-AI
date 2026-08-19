export const INTAKE_FIELD_TYPES = ['SHORT_TEXT', 'LONG_TEXT', 'SELECT', 'BOOLEAN', 'OPTIONAL_TEXT'] as const;
export type IntakeFieldType = typeof INTAKE_FIELD_TYPES[number];
export type TicketIntakeField = { key: string; label: string; type: IntakeFieldType; required: boolean; placeholder?: string; minLength?: number; maxLength?: number; options?: string[]; order: number; enabled: boolean };
export type TicketIntakeAnswer = { fieldKey: string; fieldLabel: string; fieldType: IntakeFieldType; value: string };

const text = (key: string, label: string, type: 'SHORT_TEXT' | 'LONG_TEXT' | 'OPTIONAL_TEXT', required: boolean, order: number, maxLength: number, placeholder?: string): TicketIntakeField => ({ key, label, type, required, order, maxLength, enabled: true, ...(placeholder ? { placeholder } : {}) });
export const DEFAULT_TICKET_FORMS: Record<string, TicketIntakeField[]> = {
  'account-issues': [text('issue', 'What are you having trouble with?', 'LONG_TEXT', true, 1, 1000), text('access', 'Can you access your Slice account?', 'SHORT_TEXT', true, 2, 120), text('started', 'When did the issue start?', 'SHORT_TEXT', true, 3, 120), text('details', 'Additional details', 'OPTIONAL_TEXT', false, 4, 1000)],
  'investment-issues': [text('issue', 'What part of Slice are you having trouble with?', 'LONG_TEXT', true, 1, 1000), text('collectible', 'Collectible or listing, if applicable', 'OPTIONAL_TEXT', false, 2, 120), text('occurred-at', 'Approximate date or time', 'SHORT_TEXT', true, 3, 120), text('details', 'Additional details', 'OPTIONAL_TEXT', false, 4, 1000)],
  withdrawal: [text('issue', 'What problem are you experiencing?', 'LONG_TEXT', true, 1, 1000), text('occurred-at', 'Approximate date or time', 'SHORT_TEXT', true, 2, 120), text('status', 'Current Slice status, if known', 'OPTIONAL_TEXT', false, 3, 120), text('details', 'Additional details', 'OPTIONAL_TEXT', false, 4, 1000)],
  deposit: [text('issue', 'What problem are you experiencing?', 'LONG_TEXT', true, 1, 1000), text('occurred-at', 'Approximate date or time', 'SHORT_TEXT', true, 2, 120), text('status', 'Current Slice status, if known', 'OPTIONAL_TEXT', false, 3, 120), text('details', 'Additional details', 'OPTIONAL_TEXT', false, 4, 1000)],
  'report-user': [text('subject', 'Discord user or Slice profile, if known', 'OPTIONAL_TEXT', false, 1, 120), text('incident', 'What happened?', 'LONG_TEXT', true, 2, 1000), text('occurred-at', 'Approximate date or time', 'SHORT_TEXT', true, 3, 120), text('evidence', 'Evidence or message link, if available', 'OPTIONAL_TEXT', false, 4, 300)],
  partnership: [text('organization', 'Organization or project name', 'SHORT_TEXT', true, 1, 120), text('website', 'Website or social link', 'OPTIONAL_TEXT', false, 2, 300), text('type', 'Partnership type', 'SHORT_TEXT', true, 3, 120), text('proposal', 'Short proposal', 'LONG_TEXT', true, 4, 1000)],
  'general-support': [text('issue', 'What can we help with?', 'LONG_TEXT', true, 1, 1000), text('details', 'Additional details', 'OPTIONAL_TEXT', false, 2, 1000)],
};

export const INTAKE_SAFETY_WARNING = 'Never send passwords, MFA or recovery codes, session tokens, bank login credentials, card details, wallet seed phrases, private keys, or full SSN in Discord.';

/** Returns the whole configured schema; the Discord wizard pages it in groups of five. */
export function normalizedForm(fields: TicketIntakeField[]): TicketIntakeField[] { return fields.filter((field) => field.enabled).sort((a, b) => a.order - b.order); }
export function validateForm(fields: TicketIntakeField[]): string[] {
  const errors: string[] = []; if (!fields.length || fields.length > 20) errors.push('A form must contain 1 to 20 fields.');
  const keys = new Set<string>(); for (const field of fields) { if (!/^[a-z][a-z0-9-]{0,47}$/.test(field.key) || keys.has(field.key)) errors.push('Each field needs a unique stable key.'); keys.add(field.key); if (!field.label.trim() || field.label.length > 45) errors.push('Field labels must be 1 to 45 characters.'); if (!INTAKE_FIELD_TYPES.includes(field.type)) errors.push('Unsupported field type.'); if ((field.maxLength ?? 0) > 1800 || (field.minLength ?? 0) < 0 || (field.minLength ?? 0) > (field.maxLength ?? 1800)) errors.push('Field lengths are invalid.'); if (field.type === 'SELECT' && (!field.options?.length || field.options.length > 25 || field.options.some((option) => !option.trim() || option.length > 100))) errors.push('Select fields need 1 to 25 safe options.'); }
  return [...new Set(errors)];
}
export function validateAnswers(fields: TicketIntakeField[], values: Record<string, string | undefined>): { errors: string[]; answers: TicketIntakeAnswer[] } {
  const errors: string[] = []; const answers: TicketIntakeAnswer[] = [];
  for (const field of normalizedForm(fields)) { const value = (values[field.key] ?? '').trim(); if (field.required && !value) errors.push(`${field.label} is required.`); if (!value) continue; if (value.length < (field.minLength ?? 0) || value.length > (field.maxLength ?? 1800)) errors.push(`${field.label} has an invalid length.`); if (field.type === 'SELECT' && !field.options?.includes(value)) errors.push(`${field.label} has an invalid selection.`); if (field.type === 'BOOLEAN' && !['true', 'false'].includes(value.toLowerCase())) errors.push(`${field.label} must be true or false.`); answers.push({ fieldKey: field.key, fieldLabel: field.label, fieldType: field.type, value }); }
  return { errors: [...new Set(errors)], answers };
}
