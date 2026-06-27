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
import { useAuth } from '../auth/AuthProvider';
import { somme } from '../lib/comptabilite';
import { telechargerPDF } from '../lib/export';
import { compresserImage } from '../lib/image';
import { lireMontant } from '../lib/ocr';
import ListeMontants from '../components/ListeMontants';
import { Courbe, Barres, Camembert } from '../components/Graphiques';

const moisCourt = (ym) =>
  new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(new Date(`${ym}-01T00:00:00`));

// Module admin — Comptabilité : synthèse CA / charges / fournisseurs / bénéfice
// sur un mois, une année, ou une période personnalisée. L'édition des charges
// et fournisseurs se fait en mode « Mois ».
export default function Comptabilite() {
  const { magasinId } = useAuth();
  const [periode, setPeriode] = useState('mois');
  const [mois, setMois] = useState(premierDuMois());
  const [perso, setPerso] = useState(() => {
    const [d, f] = intervallePeriode('mois');
    return { debut: d, fin: f };
  });
  const [encRows, setEncRows] = useState([]); // encaissements par clôture (date)
  const [chromesRows, setChromesRows] = useState([]); // tous les chromes de la période
  const [caAnnee, setCaAnnee] = useState(0);
  const [charges, setCharges] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);
  const [statutOcr, setStatutOcr] = useState('');

  const enMois = periode === 'mois';
  const [debut, fin] =
    periode === 'mois'
      ? intervallePeriode('mois', mois)
      : periode === 'annee'
        ? intervalleAnnee(mois)
        : [perso.debut, perso.fin];

  const charger = useCallback(async () => {
    const [anneeDebut, anneeFin] = intervalleAnnee(debut);
    const reqCharges = enMois
      ? supabase.from('charges').select('id, libelle, montant, justificatif').eq('mois', mois).order('created_at')
      : supabase.from('charges').select('id, libelle, montant').gte('mois', premierDuMois(debut)).lte('mois', fin).order('mois');
    const reqFourn = enMois
      ? supabase.from('fournisseurs').select('id, libelle, montant, justificatif').eq('mois', mois).order('created_at')
      : supabase.from('fournisseurs').select('id, libelle, montant').gte('mois', premierDuMois(debut)).lte('mois', fin).order('mois');

    // CA = encaissements (clôtures) + avances − remboursements (TOUS les chromes
    // de la période, même ceux saisis un jour sans clôture : montants dus oubliés).
    const [enc, an, chr, anChr, ch, fo] = await Promise.all([
      supabase.from('v_ca_jour').select('date, encaissements').gte('date', debut).lte('date', fin),
      supabase.from('v_ca_jour').select('encaissements').gte('date', anneeDebut).lte('date', anneeFin),
      supabase.from('chromes').select('date, type, montant').gte('date', debut).lte('date', fin),
      supabase.from('chromes').select('type, montant').gte('date', anneeDebut).lte('date', anneeFin),
      reqCharges,
      reqFourn,
    ]);
    setEncRows(enc.data ?? []);
    setChromesRows(chr.data ?? []);
    const av = (rows) => somme((rows ?? []).filter((c) => c.type === 'avance').map((c) => c.montant));
    const rb = (rows) => somme((rows ?? []).filter((c) => c.type === 'remboursement').map((c) => c.montant));
    const anEnc = somme((an.data ?? []).map((r) => r.encaissements));
    setCaAnnee(somme([anEnc, av(anChr.data), -rb(anChr.data)]));
    setCharges(ch.data ?? []);
    setFournisseurs(fo.data ?? []);
  }, [debut, fin, mois, enMois]);

  useEffect(() => {
    charger();
  }, [charger]);

  // --- CRUD (mode Mois uniquement) ---
  const setteur = { charges: setCharges, fournisseurs: setFournisseurs };
  const donnees = { charges, fournisseurs };

  async function ajouter(table) {
    const { data } = await supabase.from(table).insert({ libelle: '', montant: 0, mois }).select().single();
    if (data) setteur[table]((prev) => [...prev, data]);
  }
  function majLigne(table, id, champ, valeur) {
    setteur[table]((prev) => prev.map((x) => (x.id === id ? { ...x, [champ]: valeur } : x)));
  }
  async function enregistrer(table, id) {
    const it = donnees[table].find((x) => x.id === id);
    if (!it) return;
    await supabase.from(table).update({ libelle: it.libelle || '', montant: parseMontant(it.montant) }).eq('id', id);
  }
  async function supprimer(table, id) {
    await supabase.from(table).delete().eq('id', id);
    setteur[table]((prev) => prev.filter((x) => x.id !== id));
  }
  async function copierPrecedent(table) {
    const precedent = moisPrecedent(mois);
    const { data } = await supabase.from(table).select('libelle, montant').eq('mois', precedent);
    if (!data || data.length === 0) return;
    const { data: inserts } = await supabase
      .from(table)
      .insert(data.map((d) => ({ libelle: d.libelle, montant: d.montant, mois })))
      .select();
    setteur[table]((prev) => [...prev, ...(inserts ?? [])]);
  }

  async function ajouterJustificatif(table, id, file) {
    const blob = await compresserImage(file);
    // Chemin cloisonné par magasin (1er segment = magasin_id) : la policy
    // Storage refuse l'accès aux justificatifs d'un autre magasin.
    const chemin = `${magasinId}/${table}/${id}.jpg`;
    const { error: up } = await supabase.storage
      .from('justificatifs')
      .upload(chemin, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
    if (up) {
      window.alert(`Échec de l'envoi : ${up.message}`);
      return;
    }
    await supabase.from(table).update({ justificatif: chemin }).eq('id', id);
    setteur[table]((prev) => prev.map((x) => (x.id === id ? { ...x, justificatif: chemin } : x)));

    const ligne = donnees[table].find((x) => x.id === id);
    const dejaRempli = ligne && parseMontant(ligne.montant) > 0;
    setStatutOcr('Lecture du ticket en cours…');
    try {
      const { montant } = await lireMontant(blob);
      if (montant != null) {
        if (!dejaRempli) {
          await supabase.from(table).update({ montant }).eq('id', id);
          setteur[table]((prev) => prev.map((x) => (x.id === id ? { ...x, montant: String(montant) } : x)));
        }
        setStatutOcr(`Montant détecté : ${formatEuros(montant)} (à vérifier).`);
      } else {
        setStatutOcr('Montant non détecté sur la photo — saisis-le à la main.');
      }
    } catch {
      setStatutOcr('Lecture automatique indisponible — saisis le montant à la main.');
    }
  }

  async function voirJustificatif(chemin) {
    const { data, error } = await supabase.storage.from('justificatifs').createSignedUrl(chemin, 120);
    if (error || !data?.signedUrl) {
      window.alert("Impossible d'ouvrir le justificatif.");
      return;
    }
    window.open(data.signedUrl, '_blank');
  }

  // --- Totaux ---
  // CA par jour = encaissements de la journée + avances − remboursements du jour,
  // sur l'UNION des jours de clôture ET des jours de chromes (montants dus saisis
  // en retard inclus). Pas de double comptage : encaissements ↔ clôtures,
  // avances/remboursements ↔ table chromes.
  const jours = (() => {
    const map = {};
    const j = (date) => (map[date] ??= { enc: 0, av: 0, rb: 0 });
    encRows.forEach((r) => {
      const d = j(r.date);
      d.enc = somme([d.enc, r.encaissements]);
    });
    chromesRows.forEach((r) => {
      const d = j(r.date);
      if (r.type === 'avance') d.av = somme([d.av, r.montant]);
      else d.rb = somme([d.rb, r.montant]);
    });
    return Object.entries(map)
      .map(([date, v]) => ({ date, encaissements: v.enc, ca: somme([v.enc, v.av, -v.rb]) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  })();

  const caPeriode = somme(jours.map((d) => d.ca));
  const encaissements = somme(jours.map((d) => d.encaissements));
  const totalCharges = somme(charges.map((c) => parseMontant(c.montant)));
  const totalFournisseurs = somme(fournisseurs.map((f) => parseMontant(f.montant)));
  const totalDepenses = somme([totalCharges, totalFournisseurs]);
  const benefice = somme([caPeriode, -totalCharges, -totalFournisseurs]);

  // Répartition CA : par semaine (mois) ou par mois (année/période).
  const semaines = [1, 2, 3, 4, 5].map((n) => ({
    n,
    ca: somme(jours.filter((d) => semaineDuMois(d.date) === n).map((d) => d.ca)),
  }));
  const parMois = (() => {
    const map = {};
    jours.forEach((d) => {
      const k = d.date.slice(0, 7);
      map[k] = somme([map[k] || 0, d.ca]);
    });
    return Object.keys(map).sort().map((k) => ({ mois: k, ca: map[k] }));
  })();

  const pointsCA = jours.map((d) => ({ label: d.date.slice(8, 10), valeur: d.ca }));
  const barres = enMois
    ? semaines.map((s) => ({ label: `S${s.n}`, valeur: s.ca }))
    : parMois.map((m) => ({ label: moisCourt(m.mois), valeur: m.ca }));
  const partsCharges = charges.map((c) => ({ label: c.libelle, valeur: parseMontant(c.montant) }));
  const partsDepenses = [
    ...charges.map((c) => ({ label: c.libelle || 'Charge', valeur: parseMontant(c.montant) })),
    ...fournisseurs.map((f) => ({ label: f.libelle || 'Fournisseur', valeur: parseMontant(f.montant) })),
  ];

  function exporterPDF() {
    telechargerPDF(`comptabilite-${debut}_${fin}.pdf`, {
      titre: 'Weedland — Comptabilité',
      sousTitre: `${formatDateFr(debut)} → ${formatDateFr(fin)}`,
      resume: [
        ['CA', formatEuros(caPeriode)],
        ['Encaissements', formatEuros(encaissements)],
        ['Charges', formatEuros(totalCharges)],
        ['Fournisseurs', formatEuros(totalFournisseurs)],
        ['Bénéfice', formatEuros(benefice)],
        [`CA cumulé ${debut.slice(0, 4)}`, formatEuros(caAnnee)],
      ],
      sections: [
        enMois
          ? { titre: 'CA par semaine', entetes: ['Semaine', 'CA'], lignes: semaines.map((s) => [`Semaine ${s.n}`, formatEuros(s.ca)]) }
          : { titre: 'CA par mois', entetes: ['Mois', 'CA'], lignes: parMois.map((m) => [m.mois, formatEuros(m.ca)]) },
        { titre: 'Charges', entetes: ['Libellé', 'Montant'], lignes: charges.map((c) => [c.libelle || '—', formatEuros(parseMontant(c.montant))]) },
        { titre: 'Fournisseurs', entetes: ['Libellé', 'Montant'], lignes: fournisseurs.map((f) => [f.libelle || '—', formatEuros(parseMontant(f.montant))]) },
      ],
    });
  }

  return (
    <div className="page">
      <h1>Comptabilité</h1>

      <div className="card filtres">
        <div className="bascule">
          {[['mois', 'Mois'], ['annee', 'Année'], ['perso', 'Période']].map(([p, libelle]) => (
            <button key={p} className={periode === p ? 'actif' : ''} onClick={() => setPeriode(p)}>
              {libelle}
            </button>
          ))}
        </div>

        {periode === 'perso' ? (
          <div className="form-inline">
            <label className="field">
              <span>Du</span>
              <input type="date" value={perso.debut} onChange={(e) => setPerso((p) => ({ ...p, debut: e.target.value }))} />
            </label>
            <label className="field">
              <span>Au</span>
              <input type="date" value={perso.fin} onChange={(e) => setPerso((p) => ({ ...p, fin: e.target.value }))} />
            </label>
          </div>
        ) : (
          <label className="field">
            <span>{enMois ? 'Mois' : 'Année (choisir un mois de l’année)'}</span>
            <input type="month" value={mois.slice(0, 7)} onChange={(e) => setMois(`${e.target.value}-01`)} />
          </label>
        )}

        <button type="button" className="btn" onClick={exporterPDF}>Export PDF</button>
        <p className="periode-info">{formatDateFr(debut)} → {formatDateFr(fin)}</p>
      </div>

      <div className="cartes-kpi">
        <div className="kpi"><span className="kpi-label">CA</span><span className="kpi-valeur">{formatEuros(caPeriode)}</span></div>
        <div className="kpi"><span className="kpi-label">Encaissements</span><span className="kpi-valeur">{formatEuros(encaissements)}</span></div>
        <div className="kpi"><span className="kpi-label">Charges</span><span className="kpi-valeur">{formatEuros(totalCharges)}</span></div>
        <div className="kpi"><span className="kpi-label">Fournisseurs</span><span className="kpi-valeur">{formatEuros(totalFournisseurs)}</span></div>
        <div className="kpi"><span className="kpi-label">Bénéfice</span><span className={`kpi-valeur ${benefice >= 0 ? 'solde-ok' : 'dette'}`}>{formatEuros(benefice)}</span></div>
        <div className="kpi"><span className="kpi-label">CA cumulé {debut.slice(0, 4)}</span><span className="kpi-valeur">{formatEuros(caAnnee)}</span></div>
      </div>

      <div className="card">
        <h2>CA par jour</h2>
        <Courbe points={pointsCA} />
      </div>

      <div className="card">
        <h2>{enMois ? 'CA par semaine' : 'CA par mois'}</h2>
        <Barres items={barres} />
        <table className="tableau">
          <tbody>
            {enMois
              ? semaines.map((s) => (
                  <tr key={s.n}><td>Semaine {s.n}</td><td className="droite">{formatEuros(s.ca)}</td></tr>
                ))
              : parMois.map((m) => (
                  <tr key={m.mois}><td>{moisCourt(m.mois)} {m.mois.slice(0, 4)}</td><td className="droite">{formatEuros(m.ca)}</td></tr>
                ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Répartition des charges</h2>
        <Camembert parts={partsCharges} />
      </div>

      <div className="card">
        <div className="entete-client"><h2>Dépenses totales</h2><strong>{formatEuros(totalDepenses)}</strong></div>
        <Camembert parts={partsDepenses} />
      </div>

      {enMois ? (
        <>
          <ListeMontants
            titre="Charges"
            items={charges}
            total={totalCharges}
            onAjouter={() => ajouter('charges')}
            onMaj={(id, champ, v) => majLigne('charges', id, champ, v)}
            onEnregistrer={(id) => enregistrer('charges', id)}
            onSupprimer={(id) => supprimer('charges', id)}
            onCopierPrecedent={() => copierPrecedent('charges')}
            onJustificatif={(id, file) => ajouterJustificatif('charges', id, file)}
            onVoirJustificatif={voirJustificatif}
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
            onJustificatif={(id, file) => ajouterJustificatif('fournisseurs', id, file)}
            onVoirJustificatif={voirJustificatif}
          />
          {statutOcr && <p className="statut">📷 {statutOcr}</p>}
        </>
      ) : (
        <p className="statut">
          Vue synthèse en lecture seule. Passe en mode <strong>Mois</strong> pour ajouter/modifier
          les charges et fournisseurs (avec justificatifs).
        </p>
      )}

      <div className="card recap">
        <div className="recap-ligne"><span>CA</span><strong>{formatEuros(caPeriode)}</strong></div>
        <div className="recap-ligne"><span>− Charges</span><strong>{formatEuros(totalCharges)}</strong></div>
        <div className="recap-ligne"><span>− Fournisseurs</span><strong>{formatEuros(totalFournisseurs)}</strong></div>
        <hr />
        <div className="recap-ligne">
          <span>= Bénéfice</span>
          <strong className={benefice >= 0 ? 'solde-ok' : 'dette'}>{formatEuros(benefice)}</strong>
        </div>
      </div>
    </div>
  );
}
