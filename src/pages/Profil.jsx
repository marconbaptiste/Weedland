import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { formatEuros } from '../lib/format';
import { aujourdhuiISO, intervallePeriode } from '../lib/dates';
import { somme } from '../lib/comptabilite';
import GuideDemarrage from '../components/GuideDemarrage';

// Accueil après connexion : profil + CA (jour/semaine) + chromes détaillés du
// jour. Les outils (rendu monnaie, scanner fidélité, liste de courses) sont
// accessibles partout via les bulles flottantes (cf. Layout).
export default function Profil() {
  const { utilisateur, profil, estAdmin } = useAuth();
  const [stats, setStats] = useState({ caJour: 0, caSemaine: 0 });
  const [chromesJour, setChromesJour] = useState([]);

  useEffect(() => {
    const today = aujourdhuiISO();
    const [deb, fin] = intervallePeriode('semaine');
    (async () => {
      const [{ data: cl }, { data: chr }] = await Promise.all([
        supabase.from('v_ca_jour').select('date, encaissements').eq('employe_id', utilisateur.id).gte('date', deb).lte('date', fin),
        supabase.from('chromes').select('date, type, montant, clients(surnom)').eq('employe_id', utilisateur.id).gte('date', deb).lte('date', fin),
      ]);
      const enc = (d) => somme((cl ?? []).filter((r) => d(r.date)).map((r) => r.encaissements));
      const av = (d) => somme((chr ?? []).filter((c) => c.type === 'avance' && d(c.date)).map((c) => c.montant));
      const rb = (d) => somme((chr ?? []).filter((c) => c.type === 'remboursement' && d(c.date)).map((c) => c.montant));
      const jour = (x) => x === today;
      const tout = () => true;
      setStats({
        caJour: somme([enc(jour), av(jour), -rb(jour)]),
        caSemaine: somme([enc(tout), av(tout), -rb(tout)]),
      });
      setChromesJour(
        (chr ?? [])
          .filter((c) => c.date === today)
          .map((c) => ({ type: c.type, montant: c.montant, surnom: c.clients?.surnom ?? 'client' })),
      );
    })();
  }, [utilisateur.id]);

  const prenom = (profil?.nom ?? '').split(' ')[0];
  const avances = chromesJour.filter((c) => c.type === 'avance');
  const remboursements = chromesJour.filter((c) => c.type === 'remboursement');

  return (
    <div className="page">
      <h1>Bonjour {prenom} 👋</h1>

      <div className="cartes-kpi">
        <div className="kpi">
          <span className="kpi-label">CA du jour</span>
          <span className="kpi-valeur">{formatEuros(stats.caJour)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">CA de la semaine</span>
          <span className="kpi-valeur">{formatEuros(stats.caSemaine)}</span>
        </div>
      </div>

      <div className="card">
        <h2>Chromes du jour</h2>
        {chromesJour.length === 0 && <p className="vide">Aucun chrome aujourd’hui.</p>}
        {avances.length > 0 && (
          <div className="histo-bloc">
            <span className="histo-titre">Avances</span>
            {avances.map((a, i) => (
              <div key={`a${i}`} className="histo-chrome">
                <span>{a.surnom}</span>
                <span className="dette">+ {formatEuros(a.montant)}</span>
              </div>
            ))}
          </div>
        )}
        {remboursements.length > 0 && (
          <div className="histo-bloc">
            <span className="histo-titre">Remboursements</span>
            {remboursements.map((r, i) => (
              <div key={`r${i}`} className="histo-chrome">
                <span>{r.surnom}</span>
                <span className="solde-ok">− {formatEuros(r.montant)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <GuideDemarrage />

      {estAdmin && (
        <p className="periode-info">Tu es administrateur — retrouve la vue consolidée dans le Dashboard.</p>
      )}
    </div>
  );
}
