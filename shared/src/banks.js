// Indian banks by IFSC prefix (first 4 letters of the IFSC). Used for the bank picker,
// logos and to turn an IFSC lookup into the bank name we print on reports.
// short = label on the fallback badge; color = badge colour when no logo image is available.
export const BANKS = [
  { code: 'SBIN', name: 'State Bank of India', short: 'SBI', color: '#2a4fa3' },
  { code: 'CNRB', name: 'Canara Bank', short: 'CB', color: '#0a7cc4' },
  { code: 'UBIN', name: 'Union Bank of India', short: 'UBI', color: '#d21f2b' },
  { code: 'BARB', name: 'Bank of Baroda', short: 'BOB', color: '#f26522' },
  { code: 'IDIB', name: 'Indian Bank', short: 'IB', color: '#1c3f94' },
  { code: 'PUNB', name: 'Punjab National Bank', short: 'PNB', color: '#a6192e' },
  { code: 'MAHB', name: 'Bank of Maharashtra', short: 'BOM', color: '#0f4c97' },
  { code: 'BKID', name: 'Bank of India', short: 'BOI', color: '#f58220' },
  { code: 'CBIN', name: 'Central Bank of India', short: 'CBI', color: '#1b4f9c' },
  { code: 'IOBA', name: 'Indian Overseas Bank', short: 'IOB', color: '#1a3d8f' },
  { code: 'UCBA', name: 'UCO Bank', short: 'UCO', color: '#00539b' },
  { code: 'PSIB', name: 'Punjab & Sind Bank', short: 'PSB', color: '#0b7a3e' },
  { code: 'HDFC', name: 'HDFC Bank', short: 'HDFC', color: '#004c8f' },
  { code: 'ICIC', name: 'ICICI Bank', short: 'ICICI', color: '#b02a30' },
  { code: 'UTIB', name: 'Axis Bank', short: 'AXIS', color: '#97144d' },
  { code: 'KKBK', name: 'Kotak Mahindra Bank', short: 'KOTAK', color: '#ed1c24' },
  { code: 'YESB', name: 'Yes Bank', short: 'YES', color: '#0060aa' },
  { code: 'IDFB', name: 'IDFC FIRST Bank', short: 'IDFC', color: '#9c1d26' },
  { code: 'INDB', name: 'IndusInd Bank', short: 'IIB', color: '#8b1d41' },
  { code: 'FDRL', name: 'Federal Bank', short: 'FB', color: '#0d4a8f' },
  { code: 'KARB', name: 'Karnataka Bank', short: 'KBL', color: '#7b2a8b' },
  { code: 'KVBL', name: 'Karur Vysya Bank', short: 'KVB', color: '#0a6b3a' },
  { code: 'SIBL', name: 'South Indian Bank', short: 'SIB', color: '#c8102e' },
  { code: 'CIUB', name: 'City Union Bank', short: 'CUB', color: '#2b3990' },
  { code: 'TMBL', name: 'Tamilnad Mercantile Bank', short: 'TMB', color: '#003f87' },
  { code: 'CSBK', name: 'CSB Bank', short: 'CSB', color: '#00796b' },
  { code: 'DCBL', name: 'DCB Bank', short: 'DCB', color: '#1d3c78' },
  { code: 'RATN', name: 'RBL Bank', short: 'RBL', color: '#21409a' },
  { code: 'BDBL', name: 'Bandhan Bank', short: 'BB', color: '#c41e3a' },
  { code: 'AUBL', name: 'AU Small Finance Bank', short: 'AU', color: '#5c2d91' },
  { code: 'JAKA', name: 'Jammu & Kashmir Bank', short: 'J&K', color: '#b5121b' },
  { code: 'DLXB', name: 'Dhanlaxmi Bank', short: 'DLB', color: '#8a1538' },
  { code: 'ESFB', name: 'Equitas Small Finance Bank', short: 'ESFB', color: '#f58025' },
  { code: 'UJVN', name: 'Ujjivan Small Finance Bank', short: 'USFB', color: '#004a8f' },
  { code: 'SRCB', name: 'Saraswat Co-operative Bank', short: 'SCB', color: '#e31e24' },
  { code: 'COSB', name: 'Cosmos Co-operative Bank', short: 'CCB', color: '#00529b' },
  { code: 'TJSB', name: 'TJSB Sahakari Bank', short: 'TJSB', color: '#0f6db6' },
  { code: 'SVCB', name: 'SVC Co-operative Bank', short: 'SVC', color: '#1b5aa6' },
];

const byCode = Object.fromEntries(BANKS.map((b) => [b.code, b]));
const norm = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
const byName = Object.fromEntries(BANKS.flatMap((b) => [[norm(b.name), b], [norm(b.short), b], [norm(b.code), b]]));

export const IFSC_RX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

// bank for an IFSC ("SBIN0000691") or a typed bank name ("state bank of india", "SBI")
export const bankByCode = (code) => byCode[String(code || '').slice(0, 4).toUpperCase()] || null;
export const findBank = (nameOrIfsc) => {
  const v = String(nameOrIfsc || '').trim();
  if (!v) return null;
  if (IFSC_RX.test(v.toUpperCase())) return bankByCode(v);
  return byName[norm(v)] || null;
};
