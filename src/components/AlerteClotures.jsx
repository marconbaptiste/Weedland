import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { formatDateFr } from '../lib/format';
import { aujourdhuiISO } from '../lib/dates';

// Bandeau « clôtures manquantes » sur l'accueil : des journées récentes ont eu
// de l'activité (avances / remboursements saisis) mais AUCUNE clôture de caisse.
// Sans ce rappel, un employé peut oublier de clôturer pendant des semaines et le
// CA de la période disparaît des tableaux (incident du 22/08 → 04/09).
//  - employé : ses propres journées (chromes à lui, sans clôture à lui) ;
//  - admin : toutes les journées du magasin sans aucune clôture.
const JOURS = 45;

export default function AlerteClotures() {
  const { utilisateur, estAdmin } = useAuth();
  const [jours, setJours] = useState([]);

  useEffect(() => {
    let actif = true;
    (async () => {
      const depuis = new Date();
      depuis.setDate(depuis.getDate() - JOURS);
      const debut = depuis.toISOString().slice(0, 10);
      const aujourdHui = aujourdhuiISO(); // le jour courant n'est pas encore « manquant »
      let qChr = supabase.from('chromes').select('date').gte('date', debut).lt('date', aujourdHui);
      let qCai = supabase.from('caisse_jour').select('date').gte('date', debut).lt('date', aujourdHui);
      if (!estAdmin) {
        qChr = qChr.eq('employe_id', utilisateur.id);
        qCai = qCai.eq('employe_id', utilisateur.id);
      }
      const [{ data: chr, error: e1 }, { data: cai, error: e2 }] = await Promise.all([qChr, qCai]);
      if (!actif || e1 || e2) return;
      const clos = new Set((cai ?? []).map((c) => c.date));
      const manquants = [...new Set((chr ?? []).map((c) => c.date))].filter((d) => !clos.has(d)).sort();
      setJours(manquants);
    })();
    return () => {
      actif = false;
    };
  }, [utilisateur.id, estAdmin]);

  if (jours.length === 0) return null;
  const affiches = jours.slice(-6);
  return (
    <Link to="/caisse/cloture" className="card banniere-config banniere-alerte">
      <span className="banniere-config-emoji">⚠️</span>
      <span>
        <strong>
          {jours.length} journée{jours.length > 1 ? 's' : ''} sans clôture de caisse
        </strong>
        <span className="statut">
          {jours.length > affiches.length ? '… ' : ''}
          {affiches.map((d) => formatDateFr(d)).join(', ')} — des ventes ont été saisies ces jours-là
          mais la caisse n’a pas été clôturée : le CA de ces journées n’apparaît pas. Clôture-les en
          choisissant la date.
        </span>
      </span>
      <span className="banniere-config-fleche">→</span>
    </Link>
  );
}
