// SIRA accounts use an Orange Côte d'Ivoire mobile number: 10 digits since
// 2021, starting with 07 (MTN mobiles start with 05, Moov with 01, fixed
// lines with 2x). The traveller is told as soon as the prefix is wrong.

const OTHER_PREFIXES: Record<string, string> = {
  '05': 'un numéro MTN',
  '01': 'un numéro Moov',
  '27': 'un numéro fixe Orange',
  '25': 'un numéro fixe MTN',
  '21': 'un numéro fixe Moov',
};

// Digits of the local number, without +225 / 00225.
export function localDigits(input: string) {
  const digits = input.replace(/\D/g, '');
  if (digits.startsWith('00225')) return digits.slice(5);
  if (digits.startsWith('225') && digits.length > 10) return digits.slice(3);
  return digits;
}

// "0701020304" -> "07 01 02 03 04", as numbers are written in Abidjan.
export function formatLocal(input: string) {
  return localDigits(input).slice(0, 10).replace(/(\d{2})(?=\d)/g, '$1 ');
}

export type NumberCheck = { ok: boolean; message: string | null };

// Checked while typing: the prefix is judged from the second digit on,
// the length only once the number looks complete.
export function checkOrangeNumber(input: string): NumberCheck {
  const digits = localDigits(input);
  if (digits.length < 2) return { ok: false, message: null };
  const prefix = digits.slice(0, 2);
  if (prefix !== '07') {
    const kind = OTHER_PREFIXES[prefix];
    return {
      ok: false,
      message: `${kind ? `C’est ${kind}. ` : ''}SIRA fonctionne avec un numéro Orange : il commence par 07.`,
    };
  }
  if (digits.length < 10) return { ok: false, message: null };
  if (digits.length > 10) return { ok: false, message: 'Un numéro Orange compte 10 chiffres : 07 XX XX XX XX.' };
  return { ok: true, message: null };
}
