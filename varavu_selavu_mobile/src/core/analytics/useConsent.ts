import { useEffect, useState } from 'react';
import { ConsentState, getConsentState, subscribeConsent } from './consent';

/** Live view of the stored choices. */
export function useConsent(): ConsentState {
  const [state, setState] = useState<ConsentState>(getConsentState());
  useEffect(() => {
    setState(getConsentState());
    return subscribeConsent(setState);
  }, []);
  return state;
}
