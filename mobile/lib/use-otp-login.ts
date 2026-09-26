// Phone login in the Orange Max it way: phone number -> 4-digit SMS code ->
// session. The same flow signs in a known number or creates the account.
import { useState } from 'react';
import { requestOtp, verifyOtp, type LoginResult } from '@/lib/sira-api';
import { setSession } from '@/lib/session';
import { notify } from '@/lib/notify';

export const OTP_LENGTH = 4;

export function useOtpLogin() {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  // Counts refused codes so the screen can react (shake).
  const [failures, setFailures] = useState(0);

  const sendCode = async (phone: string) => {
    const result = await requestOtp(phone);
    setStep('code');
    setCode('');
    setInfo(result.demo_code
      ? `Mode démo : votre code est ${result.demo_code}`
      : `Code à ${OTP_LENGTH} chiffres envoyé par SMS au ${result.phone_number}`);
  };

  // Sends the code, then checks it. Resolves to the login once signed in.
  const submit = async (phone: string, typedCode = code): Promise<LoginResult | null> => {
    if (busy) return null;
    setBusy(true);
    try {
      if (step === 'phone') {
        await sendCode(phone);
        return null;
      }
      const result = await verifyOtp(phone, typedCode);
      setSession({ token: result.access_token, user: result.user });
      return result;
    } catch (error) {
      // A refused code is cleared so the next one can be typed straight away.
      if (step === 'code') { setFailures((count) => count + 1); setCode(''); }
      notify('Connexion impossible', error instanceof Error ? error.message : 'Réessayez dans un instant.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const resend = async (phone: string) => {
    if (busy) return;
    setBusy(true);
    try { await sendCode(phone); } catch (error) {
      notify('Envoi impossible', error instanceof Error ? error.message : 'Réessayez dans un instant.');
    } finally { setBusy(false); }
  };

  const changeNumber = () => { setStep('phone'); setCode(''); setInfo(null); };

  return { step, code, setCode, busy, info, failures, submit, resend, changeNumber };
}
