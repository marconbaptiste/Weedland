import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { formatEuros } from '../lib/format';
import { aujourdhuiISO, intervallePeriode } from '../lib/dates';
import { somme } from '../lib/comptabilite';
import GuideDemarrage from '../components/GuideDemarrage';
import CalculatriceMonnaie from '../components/CalculatriceMonnaie';
import ScannerFidelite from '../components/ScannerFidelite';

// Accueil après connexion : profil + stats du jour + CA de la semaine + raccourcis.
export default function Profil() {
  const { utilisateur, profil, estAdmin } = useAuth();
  const [stats, setStats] = useState({ caJour: 0, avancesJour: 0, remboursementsJour: 0, caSemaine: 0 });
  const [outil, setOutil] = useState(null); // 'monnaie' | 'scanner' | null

  useEffect(() => {
    const today = aujourdhuiISO();
    const [deb, fin] = intervallePeriode('semaine');
    (async () => {
      const [{ data: cl }, { data: chr }] = await Promise.all([
        supabase.from('v_ca_jour').select('date, encaissements').eq('employe_id', utilisateur.id).gte('date', deb).lte('date', fin),
        supabase.from('chromes').select('date, type, montant').eq('employe_id', utilisateur.id).gte('date', deb).lte('date', fin),
      ]);
      const enc = (d) => somme((cl ?? []).filter((r) => d(r.date)).map((r) => r.encaissements));
      const av = (d) => somme((chr ?? []).filter((c) => c.type === 'avance' && d(c.date)).map((c) => c.montant));
      const rb = (d) => somme((chr ?? []).filter((c) => c.type === 'remboursement' && d(c.date)).map((c) => c.montant));
      const jour = (x) => x === today;
      const tout = () => true;
      setStats({
        caJour: somme([enc(jour), av(jour), -rb(jour)]),
        avancesJour: av(jour),
        remboursementsJour: rb(jour),
        caSemaine: somme([enc(tout), av(tout), -rb(tout)]),
      });
    })();
  }, [utilisateur.id]);

  const prenom = (profil?.nom ?? '').split(' ')[0];

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
        <div className="kpi">
          <span className="kpi-label">Avances du jour</span>
          <span className="kpi-valeur">{formatEuros(stats.avancesJour)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Remboursements du jour</span>
          <span className="kpi-valeur">{formatEuros(stats.remboursementsJour)}</span>
        </div>
      </div>

      <div className="card">
        <h2>Raccourcis</h2>
        <div className="form-inline">
          <button type="button" className="btn btn-primary" onClick={() => setOutil('monnaie')}>
            💶 Rendu de monnaie
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setOutil('scanner')}>
            🎟️ Scanner fidélité
          </button>
          <Link to="/caisse" className="btn">
            🧾 Clôture de caisse
          </Link>
        </div>
      </div>

      <GuideDemarrage />

      {outil === 'monnaie' && (
        <div className="aide-fond" role="dialog" aria-modal="true" onClick={() => setOutil(null)}>
          <div className="aide-modale" onClick={(e) => e.stopPropagation()}>
            <div className="aide-tete">
              <h2>💶 Rendu de monnaie</h2>
              <button type="button" className="btn btn-discret" onClick={() => setOutil(null)}>
                Fermer
              </button>
            </div>
            <CalculatriceMonnaie />
          </div>
        </div>
      )}
      {outil === 'scanner' && <ScannerFidelite onClose={() => setOutil(null)} />}

      {estAdmin && (
        <p className="periode-info">Tu es administrateur — retrouve la vue consolidée dans le Dashboard.</p>
      )}
    </div>
  );
}
