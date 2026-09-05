import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { parseMontant, formatEuros } from '../lib/format';
import { aujourdhuiISO } from '../lib/dates';
import { resumeJour, somme, interessement } from '../lib/comptabilite';
import { lireBrouillon, ecrireBrouillon, effacerBrouillon } from '../lib/brouillon';
import { parserMessageCloture, proposerCloture } from '../lib/whatsapp';
import ChampMontant from '../components/ChampMontant';

// Montant (nombre) → texte de saisie français (virgule), vide pour 0.
const enSaisie = (n) => (n ? String(n).replace('.', ',') : '');

// Module 1 — Clôture de caisse journalière (par employé / par jour).
export default function Cloture() {
  const { utilisateur, profil, options } = useAuth();
  const tauxParDefaut = profil?.pourcentage_interessement ?? 0;
  const [date, setDate] = useState(aujourdhuiISO());
  const [form, setForm] = useState({
    cb: '',
    especes: '',
    virements: '',
    fond_caisse: '',
    heures_travaillees: '',
    commentaire: '',
  });
  const [chromesJour, setChromesJour] = useState([]);
  const [caisseId, setCaisseId] = useState(null);
  const [collegues, setCollegues] = useState([]);
  // Co-participants sélectionnés : { employe_id, nom, heures }
  const [partageurs, setPartageurs] = useState([]);
  const [statut, setStatut] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);
  const [partageOuvert, setPartageOuvert] = useState(false); // section « Journée partagée » repliée par défaut
  // CA « tel que déclaré » d'une clôture existante (avant toute modification).
  const [ventesDeclarees, setVentesDeclarees] = useState(null);
  const [modifie, setModifie] = useState(false);
  // Pré-remplissage depuis un message WhatsApp collé (format habituel de l'équipe).
  const [collerOuvert, setCollerOuvert] = useState(false);
  const [texteColle, setTexteColle] = useState('');
  const [infoColle, setInfoColle] = useState('');
  // Proposition à appliquer APRÈS le rechargement déclenché par le changement de date.
  const preRemplissage = useRef(null);

  // Brouillon (survit au changement d'onglet) : prêt seulement après chargement,
  // pour ne pas écraser le brouillon avec l'état vide initial.
  const cleBrouillon = `brouillon-caisse:${utilisateur.id}:${date}`;
  const pret = useRef(false);

  const maj = (champ) => (valeur) => {
    setModifie(true);
    setForm((f) => ({ ...f, [champ]: valeur }));
  };

  // Liste des collègues (hors soi-même) pour le partage de journée.
  useEffect(() => {
    supabase
      .rpc('collegues')
      .then(({ data }) => setCollegues((data ?? []).filter((c) => c.id !== utilisateur.id)));
  }, [utilisateur.id]);

  // Charge la clôture existante + chromes du jour + co-participants éventuels.
  // Si un brouillon non enregistré existe pour ce jour, il est restauré en priorité.
  const charger = useCallback(async () => {
    setStatut('');
    pret.current = false;
    const cle = `brouillon-caisse:${utilisateur.id}:${date}`;

    // Les deux lectures sont indépendantes → en parallèle.
    const [{ data: caisse }, { data: chromes }] = await Promise.all([
      supabase
        .from('caisse_jour')
        .select('*')
        .eq('employe_id', utilisateur.id)
        .eq('date', date)
        .maybeSingle(),
      supabase
        .from('chromes')
        .select('type, montant')
        .eq('employe_id', utilisateur.id)
        .eq('date', date),
    ]);
    setChromesJour(chromes ?? []);
    setCaisseId(caisse?.id ?? null);

    const brouillon = lireBrouillon(cle);
    setVentesDeclarees(caisse ? caisse.ventes_directes : null);
    if (brouillon?.form) {
      setForm(brouillon.form);
      setPartageurs(brouillon.partageurs ?? []);
      setModifie(true); // brouillon = saisie en cours, on recalcule
    } else if (caisse) {
      setForm({
        cb: String(caisse.cb),
        especes: String(caisse.especes),
        virements: caisse.virements ? String(caisse.virements) : '',
        fond_caisse: String(caisse.fond_caisse),
        heures_travaillees: String(caisse.heures_travaillees ?? ''),
        commentaire: caisse.commentaire ?? '',
      });
      setModifie(false); // clôture existante affichée telle que déclarée
      const { data: parts } = await supabase
        .from('caisse_partage')
        .select('employe_id, heures_travaillees')
        .eq('caisse_id', caisse.id);
      setPartageurs(
        (parts ?? []).map((p) => ({
          employe_id: p.employe_id,
          heures: String(p.heures_travaillees ?? ''),
        })),
      );
    } else {
      setForm({
        cb: '',
        especes: '',
        virements: '',
        fond_caisse: '',
        heures_travaillees: '',
        commentaire: '',
      });
      setPartageurs([]);
      setModifie(false);
    }
    // Message WhatsApp collé pour une AUTRE date : on applique la proposition
    // maintenant (après le chargement, sinon elle serait écrasée).
    if (preRemplissage.current) {
      const c = preRemplissage.current;
      preRemplissage.current = null;
      setForm((f) => ({
        ...f,
        cb: enSaisie(c.cb),
        especes: enSaisie(c.especes),
        virements: enSaisie(c.virements),
        fond_caisse: enSaisie(c.fond_caisse),
        commentaire: c.commentaire || f.commentaire,
      }));
      setModifie(true);
    }
    pret.current = true;
  }, [utilisateur.id, date, tauxParDefaut]);

  // Lit un message de clôture WhatsApp (« CB 3213,7 / Moro 692,5 / Chromes… »)
  // et pré-remplit le formulaire : rien n'est enregistré tant qu'on ne valide pas.
  // Les chromes du message ne sont PAS importés (ils se saisissent dans Clients) :
  // ils servent seulement à recalculer le CA et à signaler un écart.
  function appliquerColle() {
    const c = proposerCloture(parserMessageCloture(texteColle));
    if (!c) {
      setInfoColle('Message non reconnu : il faut au moins une ligne « CB … » ou « Moro … ».');
      return;
    }
    const messages = [];
    if (c.caAnnonce != null) {
      messages.push(
        c.ecart === 0
          ? `CA du message vérifié (${formatEuros(c.caAnnonce)}).`
          : `⚠️ CA annoncé ${formatEuros(c.caAnnonce)} ≠ recalculé ${formatEuros(c.caCalcule)} (écart ${formatEuros(c.ecart)}) — vérifie les montants.`,
      );
    }
    if (c.nbChromes) {
      messages.push(
        `${c.nbChromes} chrome(s) dans le message (${formatEuros(c.chromesMessage)}) : à saisir dans Clients s'ils ne le sont pas déjà (voir le récapitulatif).`,
      );
    }
    if (c.nbLivraisons) messages.push(`${c.nbLivraisons} livraison(s) ventilée(s) en espèces / virements (détail en commentaire).`);
    setInfoColle(messages.join(' '));
    if (c.date && c.date !== date) {
      preRemplissage.current = c;
      setDate(c.date); // → charger() applique la proposition après le rechargement
    } else {
      setForm((f) => ({
        ...f,
        cb: enSaisie(c.cb),
        especes: enSaisie(c.especes),
        virements: enSaisie(c.virements),
        fond_caisse: enSaisie(c.fond_caisse),
        commentaire: c.commentaire || f.commentaire,
      }));
      setModifie(true);
    }
    setCollerOuvert(false);
    setTexteColle('');
  }

  useEffect(() => {
    charger();
  }, [charger]);

  // Rafraîchit les chromes du jour (avances/remboursements → récap) au retour sur
  // l'onglet/la page : si un chrome a été saisi ailleurs (page Clients), le récap
  // se met à jour sans toucher à la saisie en cours du formulaire.
  useEffect(() => {
    const recharger = async () => {
      if (document.hidden) return;
      const { data } = await supabase
        .from('chromes')
        .select('type, montant')
        .eq('employe_id', utilisateur.id)
        .eq('date', date);
      setChromesJour(data ?? []);
    };
    document.addEventListener('visibilitychange', recharger);
    window.addEventListener('focus', recharger);
    return () => {
      document.removeEventListener('visibilitychange', recharger);
      window.removeEventListener('focus', recharger);
    };
  }, [utilisateur.id, date]);

  // Sauvegarde le brouillon à chaque modification (après le chargement initial).
  useEffect(() => {
    if (!pret.current) return;
    ecrireBrouillon(cleBrouillon, { form, partageurs });
  }, [form, partageurs, cleBrouillon]);

  // Diviseur de l'intéressement : seules les personnes au taux > 0 prennent
  // une part (un collègue à 0 % ne dilue pas l'intéressement des autres).
  const tauxCollegue = (id) =>
    collegues.find((c) => c.id === id)?.pourcentage_interessement ?? 0;
  const nbInteresses =
    (tauxParDefaut > 0 ? 1 : 0) +
    partageurs.filter((p) => tauxCollegue(p.employe_id) > 0).length;
  const diviseur = Math.max(nbInteresses, 1);

  function basculerCollegue(id) {
    setPartageurs((liste) =>
      liste.some((p) => p.employe_id === id)
        ? liste.filter((p) => p.employe_id !== id)
        : [...liste, { employe_id: id, heures: '' }],
    );
  }

  function majHeuresPartage(id, valeur) {
    setPartageurs((liste) =>
      liste.map((p) => (p.employe_id === id ? { ...p, heures: valeur } : p)),
    );
  }

  // Calculs temps réel. CA du jour = CB + espèces + virements + avances − remboursements.
  // (« ventes directes » = encaissé sur place = CB + espèces + virements.)
  const cbNum = parseMontant(form.cb);
  const especesNum = parseMontant(form.especes);
  const virementsNum = parseMontant(form.virements);
  // Le taux d'intéressement vient du compte (Comptes), jamais saisi par clôture.
  const resume = resumeJour(
    {
      ventes_directes: cbNum + especesNum + virementsNum,
      cb: cbNum,
      especes: especesNum,
      virements: virementsNum,
      pourcentage_interessement: tauxParDefaut,
      nb_partageurs: diviseur,
    },
    chromesJour,
  );

  // Clôture existante non modifiée -> on affiche le CA tel qu'il a été déclaré
  // (et non recalculé). Dès qu'on édite un champ, on repasse au calcul auto.
  const afficherDeclare = Boolean(caisseId) && !modifie && ventesDeclarees != null;
  const caAffiche = afficherDeclare
    ? somme([ventesDeclarees, resume.avances, resume.autres, -resume.remboursements])
    : resume.ca;
  const intAffiche = afficherDeclare
    ? interessement(caAffiche, tauxParDefaut, diviseur)
    : resume.interessement;

  async function enregistrer(e) {
    e.preventDefault();
    // Garde-fou : éviter d'enregistrer une clôture vide par erreur.
    const rienEncaisse = somme([cbNum, especesNum, virementsNum]) === 0;
    if (rienEncaisse && chromesJour.length === 0) {
      if (!window.confirm('Aucune vente saisie (0 €). Enregistrer quand même cette clôture ?')) return;
    }
    const fondNum = parseMontant(form.fond_caisse);
    const heuresNum = parseMontant(form.heures_travaillees);
    if ([cbNum, especesNum, virementsNum, fondNum, heuresNum].some((v) => v < 0)) {
      setStatut('Les montants ne peuvent pas être négatifs.');
      return;
    }
    setEnregistrement(true);
    setStatut('');
    const { data: ligne, error } = await supabase
      .from('caisse_jour')
      .upsert(
        {
          employe_id: utilisateur.id,
          date,
          ventes_directes: somme([cbNum, especesNum, virementsNum]),
          cb: cbNum,
          especes: especesNum,
          virements: virementsNum,
          fond_caisse: fondNum,
          heures_travaillees: heuresNum,
          pourcentage_interessement: tauxParDefaut,
          commentaire: form.commentaire || null,
        },
        { onConflict: 'employe_id,date' },
      )
      .select()
      .single();

    if (error || !ligne) {
      setEnregistrement(false);
      console.error('Clôture — enregistrement:', error);
      setStatut('Enregistrement impossible. Vérifie ta connexion et réessaie.');
      return;
    }

    setCaisseId(ligne.id);

    // Remplace les co-participants de cette clôture en UNE transaction
    // (`caisse_partage_set`) : plus de delete-puis-insert qui pouvait laisser
    // la clôture sans co-participants (intéressement des collègues perdu).
    const { error: errPartage } = await supabase.rpc('caisse_partage_set', {
      p_caisse: ligne.id,
      p_partageurs: partageurs.map((p) => ({
        employe_id: p.employe_id,
        heures_travaillees: parseMontant(p.heures),
      })),
    });
    if (errPartage) {
      setEnregistrement(false);
      setStatut(`Clôture enregistrée, mais partage en erreur : ${errPartage.message}`);
      return;
    }

    // Recharge depuis la base pour confirmer la persistance et rafraîchir le récap.
    effacerBrouillon(cleBrouillon);
    await charger();
    setEnregistrement(false);
    setStatut('Clôture enregistrée ✅');
  }

  async function supprimerCloture() {
    if (!caisseId) return;
    if (!window.confirm('Supprimer cette clôture ? Cette action est irréversible.')) return;
    const { error } = await supabase.from('caisse_jour').delete().eq('id', caisseId);
    if (error) {
      setStatut('Suppression impossible.');
      return;
    }
    setCaisseId(null);
    setPartageurs([]);
    setForm({
      cb: '',
      especes: '',
      virements: '',
      fond_caisse: '',
      heures_travaillees: '',
      commentaire: '',
    });
    setStatut('Clôture supprimée.');
  }

  return (
    <div className="page">
      <h1>Clôture de caisse</h1>

      <label className="field">
        <span>Date</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>

      {/* Propre au magasin (drapeau `magasins.import_whatsapp`) : format de message d'une équipe précise. */}
      {options.whatsapp && (
      <div className="card">
        <button
          type="button"
          className="courses-tete"
          onClick={() => setCollerOuvert((o) => !o)}
          aria-expanded={collerOuvert}
        >
          <h2>📋 Coller un message WhatsApp</h2>
          <span className="chevron">{collerOuvert ? '▾' : '▸'}</span>
        </button>
        {collerOuvert && (
          <>
            <p className="statut">
              Copie le message de clôture posté dans le groupe (date, CA, CB, Moro, chromes, livraisons,
              caisse départ) : la date et les montants sont pré-remplis ci-dessous, à vérifier avant
              d’enregistrer.
            </p>
            <textarea
              rows={6}
              value={texteColle}
              onChange={(e) => setTexteColle(e.target.value)}
              placeholder={'04/09\nCA 4046,20\nCB 3213,7\nMoro 692,5\nChromes\nGaétan +33\n…'}
            />
            <button type="button" className="btn btn-primary" onClick={appliquerColle} disabled={!texteColle.trim()}>
              Pré-remplir la clôture
            </button>
          </>
        )}
        {infoColle && <p className="statut">{infoColle}</p>}
      </div>
      )}

      <div className="grille-caisse">
        <div className="col">
          <form className="card" onSubmit={enregistrer}>
        <ChampMontant label="Encaissements CB" valeur={form.cb} onChange={maj('cb')} autoFocus />
        <ChampMontant label="Espèces" valeur={form.especes} onChange={maj('especes')} />
        <ChampMontant
          label="Virements / autres"
          valeur={form.virements}
          onChange={maj('virements')}
        />
        <small className="champ-aide">Virements bancaires, chèques… reçus ce jour (hors CB et espèces).</small>
        <ChampMontant label="Fond de caisse" valeur={form.fond_caisse} onChange={maj('fond_caisse')} />
        <small className="champ-aide">Espèces laissées dans la caisse pour rendre la monnaie. Optionnel.</small>
        <label className="field">
          <span>Heures travaillées</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="ex. 6,5"
            value={form.heures_travaillees}
            onChange={(e) => maj('heures_travaillees')(e.target.value)}
          />
          <small className="champ-aide">Pour info / suivi RH — n’affecte pas l’intéressement.</small>
        </label>
        <p className="statut">
          Taux d’intéressement : <strong>{tauxParDefaut} %</strong> (défini dans Comptes par
          l’admin).
        </p>
        <label className="field">
          <span>Commentaire</span>
          <textarea
            rows={2}
            value={form.commentaire}
            onChange={(e) => maj('commentaire')(e.target.value)}
          />
        </label>
        <button className="btn btn-primary" type="submit" disabled={enregistrement}>
          {enregistrement ? 'Enregistrement…' : 'Enregistrer la clôture'}
        </button>
        {caisseId && (
          <button type="button" className="btn btn-discret" onClick={supprimerCloture}>
            Supprimer la clôture
          </button>
        )}
        {statut && <p className="statut">{statut}</p>}
      </form>

      <div className="card">
        <button
          type="button"
          className="courses-tete"
          onClick={() => setPartageOuvert((o) => !o)}
          aria-expanded={partageOuvert || partageurs.length > 0}
        >
          <h2>
            👥 Journée partagée
            {partageurs.length > 0 && <span className="badge badge-solde tag-partage">{partageurs.length}</span>}
          </h2>
          <span className="chevron">{partageOuvert || partageurs.length > 0 ? '▾' : '▸'}</span>
        </button>
        {(partageOuvert || partageurs.length > 0) && (
          <>
            <p className="statut">
              Cochez les collègues présents <strong>en même temps</strong> que vous. L’intéressement
              sera réparti à parts égales (CA ÷ nombre de personnes). Une seule personne saisit la
              clôture ; les autres ne créent pas la leur ce jour-là.
            </p>
            <ul className="liste-partage">
              {collegues.map((c) => {
                const sel = partageurs.find((p) => p.employe_id === c.id);
                return (
                  <li key={c.id} className="ligne-partage">
                    <label className="case-partage">
                      <input
                        type="checkbox"
                        checked={Boolean(sel)}
                        onChange={() => basculerCollegue(c.id)}
                      />
                      <span>
                        {c.nom}
                        <span className="promo-qui"> · {c.pourcentage_interessement ?? 0} %</span>
                      </span>
                    </label>
                    {sel && (
                      <input
                        className="champ-pourcentage"
                        type="text"
                        inputMode="decimal"
                        placeholder="heures"
                        value={sel.heures}
                        onChange={(e) => majHeuresPartage(c.id, e.target.value)}
                      />
                    )}
                  </li>
                );
              })}
              {collegues.length === 0 && <li className="vide">Aucun autre employé.</li>}
            </ul>
          </>
        )}
      </div>
        </div>

        <div className="col">
      <div className="card recap">
        <h2>Récapitulatif du jour</h2>
        <div className="recap-ligne">
          <span>Avances</span>
          <strong>{formatEuros(resume.avances)}</strong>
        </div>
        {resume.remboursements > 0 && (
          <div className="recap-ligne">
            <span>Remboursements de dettes <span className="recap-info">(sans effet sur le CA)</span></span>
            <strong>{formatEuros(resume.remboursements)}</strong>
          </div>
        )}
        {resume.autres > 0 && (
          <div className="recap-ligne">
            <span>Autres encaissements</span>
            <strong>{formatEuros(resume.autres)}</strong>
          </div>
        )}
        {virementsNum > 0 && (
          <div className="recap-ligne">
            <span>Virements / autres</span>
            <strong>{formatEuros(virementsNum)}</strong>
          </div>
        )}
        <hr />
        <div className="recap-paire">
          <div className="recap-bloc">
            <span className="recap-label">CA du jour{afficherDeclare ? ' (déclaré)' : ''}</span>
            <span className="recap-valeur">{formatEuros(caAffiche)}</span>
          </div>
          <div className="recap-bloc">
            <span className="recap-label">Encaissements</span>
            <span className="recap-valeur">{formatEuros(resume.encaissements)}</span>
          </div>
        </div>
        <p className="statut">
          CA = ventes du jour (CB, espèces, virements, hors remboursements de dettes) + avances +
          autres. Un remboursement récupère une dette déjà comptée au CA le jour de l’avance.
        </p>
        <hr />
        <div className="recap-ligne">
          <span>
            Votre intéressement
            {tauxParDefaut > 0 &&
              ` (${tauxParDefaut} %${nbInteresses > 1 ? ` · CA ÷ ${nbInteresses}` : ''})`}
          </span>
          <strong>{formatEuros(intAffiche)}</strong>
        </div>
      </div>
        </div>
      </div>
    </div>
  );
}
