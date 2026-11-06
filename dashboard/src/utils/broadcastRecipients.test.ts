import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from '@e965/xlsx';
import {
  broadcastTemplateVariables,
  normalizeIndianMobile,
  parseBroadcastFile,
  parseBroadcastRows,
  renderBroadcastTemplate,
} from './broadcastRecipients.ts';

const headers = ['STATE', 'REG NO', 'OWNER NAME', 'ADDRESS', 'ADDRESS', 'city', 'MOBILE', 'CONSENT'];

test('imports only explicit opt-ins and keeps duplicate spreadsheet headers distinct', () => {
  const result = parseBroadcastRows([
    headers,
    ['Uttar Pradesh', 'UP32PZ2125', 'ASHOK KUMAR RAWAT', 'House 2', '226020', 'LUCKNOW', '9415422547', 'yes'],
    ['Uttar Pradesh', 'UP32PZ2126', 'NO CONSENT', 'House 3', '226021', 'KANPUR', '9415422548', 'no'],
    ['Uttar Pradesh', 'UP32PZ2127', 'BAD NUMBER', 'House 4', '226022', 'AGRA', '12345', 'yes'],
    ['Uttar Pradesh', 'UP32PZ2128', 'DUPLICATE', 'House 5', '226023', 'LUCKNOW', '+91 94154 22547', 'true'],
  ]);

  assert.equal(result.recipients.length, 1);
  assert.equal(result.recipients[0].chatId, '919415422547@c.us');
  assert.equal(result.recipients[0].fields.address_2, '226020');
  assert.equal(result.excluded, 3);
});

test('requires a consent column even when a phone column is present', () => {
  assert.throws(
    () =>
      parseBroadcastRows([
        ['MOBILE', 'OWNER NAME'],
        ['9415422547', 'A'],
      ]),
    /explicit Consent or Opt-in/,
  );
});

test('finds the header row below a spreadsheet title row', () => {
  const result = parseBroadcastRows([
    ['Vehicle owner contact export'],
    ['MOBILE', 'CONSENT', 'OWNER NAME'],
    ['9415422547', 'yes', 'Ashok'],
  ]);
  assert.equal(result.recipients[0].fields.owner_name, 'Ashok');
});

test('normalizes India numbers with 10 digits, 91 prefix, +91, and 0091', () => {
  assert.equal(normalizeIndianMobile('9415422547'), '919415422547');
  assert.equal(normalizeIndianMobile('919415422547'), '919415422547');
  assert.equal(normalizeIndianMobile('+91 94154-22547'), '919415422547');
  assert.equal(normalizeIndianMobile('0091 94154 22547'), '919415422547');
  assert.equal(normalizeIndianMobile('091415422547'), null);
  assert.equal(normalizeIndianMobile('5415422547'), null);
});

test('renders normalized cell keys and leaves unknown placeholders visible', () => {
  assert.equal(
    renderBroadcastTemplate('Hello {{owner_name}}, your vehicle {{reg_no}} is in {{city}}. {{unknown}}', {
      owner_name: 'Ashok',
      reg_no: 'UP32PZ2125',
      city: 'Lucknow',
    }),
    'Hello Ashok, your vehicle UP32PZ2125 is in Lucknow. {{unknown}}',
  );
  assert.deepEqual(broadcastTemplateVariables('Hello {{owner_name}}, {{reg_no}} / {city} {{owner_name}}'), [
    'owner_name',
    'reg_no',
    'city',
  ]);
});

const textFile = (name: string, text: string): File => {
  const bytes = new TextEncoder().encode(text);
  return {
    name,
    size: bytes.byteLength,
    text: async () => text,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as File;
};

test('parses CSV and JSON files with an explicit opt-in column', async () => {
  const csv = await parseBroadcastFile(
    textFile('contacts.csv', 'MOBILE,CONSENT,OWNER NAME\n9415422547,yes,Ashok\n9415422548,no,Other'),
  );
  const json = await parseBroadcastFile(
    textFile(
      'contacts.json',
      JSON.stringify([
        { MOBILE: '+91 94154 22547', CONSENT: true, 'OWNER NAME': 'Ashok' },
        { MOBILE: '9415422548', CONSENT: false, 'OWNER NAME': 'Other' },
      ]),
    ),
  );

  assert.equal(csv.recipients[0].chatId, '919415422547@c.us');
  assert.equal(json.recipients[0].fields.owner_name, 'Ashok');
  assert.equal(csv.excluded, 1);
  assert.equal(json.excluded, 1);
});

test('parses XLSX workbooks from the first sheet', async () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['MOBILE', 'CONSENT', 'OWNER NAME'],
      ['9415422547', 'yes', 'Ashok'],
    ]),
    'Recipients',
  );
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const file = {
    name: 'contacts.xlsx',
    size: bytes.byteLength,
    arrayBuffer: async () => bytes,
  } as File;
  const result = await parseBroadcastFile(file);

  assert.equal(result.recipients[0].chatId, '919415422547@c.us');
  assert.equal(result.recipients[0].fields.owner_name, 'Ashok');
});

test('parses legacy XLS workbooks', async () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['MOBILE', 'CONSENT', 'OWNER NAME'],
      ['9415422547', 'yes', 'Ashok'],
    ]),
    'Recipients',
  );
  const bytes = XLSX.write(workbook, { bookType: 'xls', type: 'array' }) as ArrayBuffer;
  const file = {
    name: 'contacts.xls',
    size: bytes.byteLength,
    arrayBuffer: async () => bytes,
  } as File;
  const result = await parseBroadcastFile(file);

  assert.equal(result.recipients[0].chatId, '919415422547@c.us');
  assert.equal(result.recipients[0].fields.owner_name, 'Ashok');
});
