import { useCallback, useRef } from 'react';

/**
 * Verrou anti-double soumission (double tap au comptoir mobile) : tant qu'un
 * appel est en cours, les appels suivants sont ignorés. Usage :
 *
 *   const verrou = useVerrou();
 *   <form onSubmit={(e) => verrou(() => ajouterLigne(e))}>
 *
 * `fn` est appelée de façon synchrone (le `preventDefault` qu'elle contient
 * s'exécute donc bien avant la soumission native du formulaire).
 */
export function useVerrou() {
  const ref = useRef(false);
  return useCallback(async (fn) => {
    if (ref.current) return undefined;
    ref.current = true;
    try {
      return await fn();
    } finally {
      ref.current = false;
    }
  }, []);
}
