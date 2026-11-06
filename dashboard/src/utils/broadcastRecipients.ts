import * as XLSX from '@e965/xlsx';

export const BROADCAST_MAX_RECIPIENTS = 100;
export const BROADCAST_FILE_MAX_BYTES = 2 * 1024 * 1024;

export interface BroadcastRecipient {
  chatId: string;
  fields: Record<string, string>;
}

export interface BroadcastImport {
  recipients: BroadcastRecipient[];
  excluded: number;
  fields: string[];
}

const PHONE_HEADERS = new Set(['mobile', 'mobile_no', 'mobile_number', 'phone', 'phone_no', 'phone_number']);
const CONSENT_HEADERS = new Set([
  'consent',
  'opt_in',
  'opted_in',
  'whatsapp_consent',
  'whatsapp_opt_in',
  'consent_to_whatsapp',
  'marketing_consent',
]);
const CONSENT_VALUES = new Set(['true', 'yes', 'y', '1', 'opted in', 'opt-in', 'consented', 'accepted']);

const normalizeHeader = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const cellText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
};

export function normalizeIndianMobile(value: unknown): string | null {
  let digits = cellText(value).replace(/[^0-9]/g, '');
  if (digits.startsWith('0091')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10 && /^[6-9]/.test(digits)) digits = `91${digits}`;
  if (!/^91[6-9][0-9]{9}$/.test(digits)) return null;
  return digits;
}

export function parseBroadcastRows(rows: unknown[][]): BroadcastImport {
  const headerRowIndex = rows.findIndex(row => {
    const headers = row.map(normalizeHeader);
    return headers.some(header => PHONE_HEADERS.has(header)) && headers.some(header => CONSENT_HEADERS.has(header));
  });
  if (headerRowIndex < 0) {
    if (rows.some(row => row.some(value => PHONE_HEADERS.has(normalizeHeader(value))))) {
      throw new Error('An explicit Consent or Opt-in column is required.');
    }
    throw new Error('A Mobile or Phone column is required.');
  }

  const rawHeaders = rows[headerRowIndex];
  const occurrences = new Map<string, number>();
  const headers = rawHeaders.map((header, index) => {
    const base = normalizeHeader(header) || `column_${index + 1}`;
    const occurrence = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, occurrence);
    return occurrence === 1 ? base : `${base}_${occurrence}`;
  });
  const phoneIndex = headers.findIndex(header => PHONE_HEADERS.has(header.replace(/_[0-9]+$/, '')));
  const consentIndex = headers.findIndex(header => CONSENT_HEADERS.has(header.replace(/_[0-9]+$/, '')));
  const seen = new Set<string>();
  const recipients: BroadcastRecipient[] = [];
  let excluded = 0;
  for (const row of rows.slice(headerRowIndex + 1)) {
    if (!row.some(value => cellText(value) !== '')) continue;
    const consent = cellText(row[consentIndex]).toLowerCase();
    const chatNumber = CONSENT_VALUES.has(consent) ? normalizeIndianMobile(row[phoneIndex]) : null;
    if (!chatNumber || seen.has(chatNumber)) {
      excluded += 1;
      continue;
    }

    const fields = Object.fromEntries(headers.map((header, index) => [header, cellText(row[index])]));
    seen.add(chatNumber);
    recipients.push({ chatId: `${chatNumber}@c.us`, fields });
  }

  if (recipients.length > BROADCAST_MAX_RECIPIENTS) {
    throw new Error(`Only ${BROADCAST_MAX_RECIPIENTS} opted-in recipients can be included per broadcast.`);
  }
  return { recipients, excluded, fields: headers.filter(Boolean) };
}

export function renderBroadcastTemplate(template: string, fields: Record<string, string>): string {
  return template.replace(/{{\s*([\w.-]+)\s*}}|{(\w+)}/g, (placeholder, doubleKey: string, singleKey: string) => {
    const value = fields[doubleKey ?? singleKey];
    return value === undefined ? placeholder : value;
  });
}

export function broadcastTemplateVariables(template: string): string[] {
  return [
    ...new Set(
      [...template.matchAll(/{{\s*([\w.-]+)\s*}}|{(\w+)}/g)].map((match: RegExpMatchArray) => match[1] ?? match[2]),
    ),
  ];
}

function jsonRecordsToRows(data: unknown): unknown[][] {
  const records = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? Object.values(data).find(value => Array.isArray(value))
      : null;
  if (
    !Array.isArray(records) ||
    records.length === 0 ||
    !records.every(record => record && typeof record === 'object')
  ) {
    throw new Error('JSON must contain an array of row objects.');
  }
  const headers = [...new Set(records.flatMap(record => Object.keys(record as Record<string, unknown>)))];
  return [headers, ...records.map(record => headers.map(header => (record as Record<string, unknown>)[header]))];
}

export async function parseBroadcastFile(file: File): Promise<BroadcastImport> {
  if (file.size > BROADCAST_FILE_MAX_BYTES) throw new Error('The selected file exceeds the 2 MB limit.');
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'json') return parseBroadcastRows(jsonRecordsToRows(JSON.parse(await file.text())));
  if (!['csv', 'xls', 'xlsx'].includes(extension ?? '')) {
    throw new Error('Choose an .xlsx, .xls, .csv, or .json file.');
  }

  const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) throw new Error('The selected workbook has no sheets.');
  return parseBroadcastRows(XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '', raw: false }));
}
