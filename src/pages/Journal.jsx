import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatEuros, formatDateFr } from '../lib/format';

// Module 5 — Journal / logs (réservé admin).
// Flux chronologique reconstitué à partir des created_at / employe_id déjà
// horodatés sur chaque table (pas de table de logs redondante).
function heure(iso) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function Journal() {
  const [evenements, setEvenements] = useState([]);

  useEffect(() => {
    async function charger() {
      const [caisse, chromes, paiements] = await Promise.all([
        supabase
          .from('caisse_jour')
          .select('id, date, created_at, ventes_directes, users(nom)')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('chromes')
          .select('id, date, created_at, type, montant, users(nom), clients(surnom)')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('paiements_employes')
          .select('id, date, created_at, montant, users(nom)')
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      const items = [
        ...(caisse.data ?? []).map((c) => ({
          cle: `caisse-${c.id}`,
          created_at: c.created_at,
          employe: c.users?.nom ?? '—',
          categorie: 'Caisse',
          libelle: `Clôture du ${formatDateFr(c.date)} · ventes ${formatEuros(c.ventes_directes)}`,
        })),
        ...(chromes.data ?? []).map((c) => ({
          cle: `chrome-${c.id}`,
          created_at: c.created_at,
          employe: c.users?.nom ?? '—',
          categorie: c.type === 'avance' ? 'Avance' : 'Remboursement',
          libelle: `${c.clients?.surnom ?? 'client'} · ${formatEuros(c.montant)} (${formatDateFr(c.date)})`,
        })),
        ...(paiements.data ?? []).map((p) => ({
          cle: `paiement-${p.id}`,
          created_at: p.created_at,
          employe: p.users?.nom ?? '—',
          categorie: 'Paiement',
          libelle: `${formatEuros(p.montant)} (${formatDateFr(p.date)})`,
        })),
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      setEvenements(items.slice(0, 80));
    }
    charger();
  }, []);

  return (
    <div className="page">
      <h1>Journal</h1>
      <div className="card">
        <ul className="journal">
          {evenements.map((e) => (
            <li key={e.cle} className="journal-item">
              <span className="journal-quand">
                {formatDateFr(e.created_at)} {heure(e.created_at)}
              </span>
              <span className={`badge journal-cat cat-${e.categorie.toLowerCase()}`}>
                {e.categorie}
              </span>
              <span className="journal-texte">{e.libelle}</span>
              <span className="journal-qui">{e.employe}</span>
            </li>
          ))}
          {evenements.length === 0 && <li className="vide">Aucune activité.</li>}
        </ul>
      </div>
    </div>
  );
}
