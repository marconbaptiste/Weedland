import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { parseMontant, formatEuros, formatDateFr } from '../lib/format';
import {
  premierDuMois,
  moisPrecedent,
  intervallePeriode,
  intervalleAnnee,
  semaineDuMois,
} from '../lib/dates';
import { somme } from '../lib/comptabilite';
import ListeMontants from '../components/ListeMontants';

// Module admin — Comptabilité : CA mois/semaine/année, charges, fournisseurs,
// bénéfice. Charges et fournisseurs sont mensuels (repris du mois précédent).
export default function Comptabilite() {
  const [mois, setMois] = useState(premierDuMois());
  const [caRows, setCaRows] = useState([]);
  const [caAnnee, setCaAnnee] = useState(0);
  const [charges, setCharges] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);

  const [debut, fin] = intervallePeriode('mois', mois);

  const charger = useCallback(async () => {
    const [anneeDebut, anneeFin] = intervalleAnnee(mois);
    const [ca, an, ch, fo] = await Promise.all([
      supabase.from('v_ca_jour').select('date, ca_jour, encaissements').gte('date', debut).lte('date', fin),
      supabase.from('v_ca_jour').select('ca_jour').gte('date', anneeDebut).lte('date', anneeFin),
      supabase.from('charges').select('id, libelle, montant').eq('mois', mois).order('created_at'),
      supabase.from('fournisseurs').select('id, libelle, montant').eq('mois', mois).order('created_at'),
    ]);
    setCaRows(ca.data ?? []);
    setCaAnnee(somme((an.data ?? []).map((r) => r.ca_jour)));
    setCharges(ch.data ?? []);
    setFournisseurs(fo.data ?? []);
  }, [debut, fin, mois]);

  useEffect(() => {
    charger();
  }, [charger]);

  // --- CRUD générique charges / fournisseurs ---
  const setteur = { charges: setCharges, fournisseurs: setFournisseurs };
  const donnees = { charges, fournisseurs };

  async function ajouter(table) {
    const { data } = await supabase
      .from(table)
      .insert({ libelle: '', montant: 0, mois })
      .select()
      .single();
    if (data) setteur[table]((prev) => [...prev, data]);
  }

  function majLigne(table, id, champ, valeur) {
    setteur[table]((prev) => prev.map((x) => (x.id === id ? { ...x, [champ]: valeur } : x)));
  }

  async function enregistrer(table, id) {
    const it = donnees[table].find((x) => x.id === id);
    if (!it) return;
    await supabase
      .from(table)
      .update({ libelle: it.libelle || '', montant: parseMontant(it.montant) })
      .eq('id', id);
  }

  async function supprimer(table, id) {
    await supabase.from(table).delete().eq('id', id);
    setteur[table]((prev) => prev.filter((x) => x.id !== id));
  }

  async function copierPrecedent(table) {
    const precedent = moisPrecedent(mois);
    const { data } = await supabase
      .from(table)
      .select('libelle, montant')
      .eq('mois', precedent);
    if (!data || data.length === 0) return;
    const { data: inserts } = await supabase
      .from(table)
      .insert(data.map((d) => ({ libelle: d.libelle, montant: d.montant, mois })))
      .select();
    setteur[table]((prev) => [...prev, ...(inserts ?? [])]);
  }

  // --- Totaux ---
  const caMois = somme(caRows.map((r) => r.ca_jour));
  const encaissementsMois = somme(caRows.map((r) => r.encaissements));
  const totalCharges = somme(charges.map((c) => parseMontant(c.montant)));
  const totalFournisseurs = somme(fournisseurs.map((f) => parseMontant(f.montant)));
  const benefice = somme([caMois, -totalCharges, -totalFournisseurs]);

  // CA par semaine (1 à 5) du mois.
  const semaines = [1, 2, 3, 4, 5].map((n) => ({
    n,
    ca: somme(caRows.filter((r) => semaineDuMois(r.date) === n).map((r) => r.ca_jour)),
  }));

  return (
    <div className="page">
      <h1>Comptabilité</h1>

      <div className="card filtres">
        <label className="field">
          <span>Mois</span>
          <input
            type="month"
            value={mois.slice(0, 7)}
            onChange={(e) => setMois(`${e.target.value}-01`)}
          />
        </label>
        <p className="periode-info">
          {formatDateFr(debut)} → {formatDateFr(fin)}
        </p>
      </div>

      <div className="cartes-kpi">
        <div className="kpi">
          <span className="kpi-label">CA du mois</span>
          <span className="kpi-valeur">{formatEuros(caMois)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Encaissements</span>
          <span className="kpi-valeur">{formatEuros(encaissementsMois)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Charges</span>
          <span className="kpi-valeur">{formatEuros(totalCharges)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Fournisseurs</span>
          <span className="kpi-valeur">{formatEuros(totalFournisseurs)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Bénéfice</span>
          <span className={`kpi-valeur ${benefice >= 0 ? 'solde-ok' : 'dette'}`}>
            {formatEuros(benefice)}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">CA cumulé {mois.slice(0, 4)}</span>
          <span className="kpi-valeur">{formatEuros(caAnnee)}</span>
        </div>
      </div>

      <div className="card">
        <h2>CA par semaine</h2>
        <table className="tableau">
          <tbody>
            {semaines.map((s) => (
              <tr key={s.n}>
                <td>Semaine {s.n}</td>
                <td className="droite">{formatEuros(s.ca)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ListeMontants
        titre="Charges"
        items={charges}
        total={totalCharges}
        onAjouter={() => ajouter('charges')}
        onMaj={(id, champ, v) => majLigne('charges', id, champ, v)}
        onEnregistrer={(id) => enregistrer('charges', id)}
        onSupprimer={(id) => supprimer('charges', id)}
        onCopierPrecedent={() => copierPrecedent('charges')}
      />

      <ListeMontants
        titre="Fournisseurs"
        items={fournisseurs}
        total={totalFournisseurs}
        onAjouter={() => ajouter('fournisseurs')}
        onMaj={(id, champ, v) => majLigne('fournisseurs', id, champ, v)}
        onEnregistrer={(id) => enregistrer('fournisseurs', id)}
        onSupprimer={(id) => supprimer('fournisseurs', id)}
        onCopierPrecedent={() => copierPrecedent('fournisseurs')}
      />

      <div className="card recap">
        <div className="recap-ligne">
          <span>CA du mois</span>
          <strong>{formatEuros(caMois)}</strong>
        </div>
        <div className="recap-ligne">
          <span>− Charges</span>
          <strong>{formatEuros(totalCharges)}</strong>
        </div>
        <div className="recap-ligne">
          <span>− Fournisseurs</span>
          <strong>{formatEuros(totalFournisseurs)}</strong>
        </div>
        <hr />
        <div className="recap-ligne">
          <span>= Bénéfice</span>
          <strong className={benefice >= 0 ? 'solde-ok' : 'dette'}>{formatEuros(benefice)}</strong>
        </div>
      </div>
    </div>
  );
}
