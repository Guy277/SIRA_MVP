// Two-step phone login shared by the login and sign-up screens:
// phone number -> SMS code -> session.
import { useState } from 'react';
import { requestOtp, verifyOtp } from '@/lib/sira-api';
import { setSession } from '@/lib/session';
import { notify } from '@/lib/notify';

export function useOtpLogin() {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  // Resolves to true once the traveller is signed in.
  const submit = async (phone: string, fullName?: string): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    try {
      if (step === 'phone') {
        const result = await requestOtp(phone);
        setStep('code');
        setInfo(result.demo_code
          ? `Mode démo : votre code est ${result.demo_code}`
          : `Code envoyé par SMS au ${result.phone_number}`);
        return false;
      }
      const result = await verifyOtp(phone, code, fullName);
      setSession({ token: result.access_token, user: result.user });
      return true;
    } catch (error) {
      notify('Connexion impossible', error instanceof Error ? error.message : 'Réessayez dans un instant.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const changeNumber = () => { setStep('phone'); setCode(''); setInfo(null); };

  return { step, code, setCode, busy, info, submit, changeNumber };
}
