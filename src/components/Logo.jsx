// Marque Kanabiz : feuille « business » (folioles ascendantes) + nom.
// La feuille hérite de la couleur du texte (currentColor) — s'intègre partout.
const LAME = 'M0,0 C-0.12,-0.32 -0.06,-0.82 0,-1 C0.06,-0.82 0.12,-0.32 0,0 Z';

export function FeuilleKanabiz({ taille = 22, className = '' }) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="90 100 332 350"
      fill="currentColor"
      aria-hidden="true"
      className={`marque-mark ${className}`}
    >
      <g transform="translate(8,0)">
        <g transform="translate(110,372) rotate(-8) scale(140)"><path d={LAME} /></g>
        <g transform="translate(160,372) rotate(-5) scale(196)"><path d={LAME} /></g>
        <g transform="translate(208,372) rotate(-2) scale(250)"><path d={LAME} /></g>
        <g transform="translate(256,372)">
          <g transform="rotate(0)  scale(264)"><path d={LAME} /></g>
          <g transform="rotate(32) scale(204)"><path d={LAME} /></g>
          <g transform="rotate(58) scale(156)"><path d={LAME} /></g>
          <g transform="rotate(84) scale(112)"><path d={LAME} /></g>
        </g>
        <rect x="251" y="368" width="10" height="66" rx="5" />
      </g>
    </svg>
  );
}

// Logo complet (feuille + « Kanabiz »). `nom={false}` pour la feuille seule ;
// `taille` pilote la feuille, le mot s'adapte.
export default function Logo({ taille = 22, nom = true, className = '' }) {
  return (
    <span className={`marque ${className}`}>
      <FeuilleKanabiz taille={taille} />
      {nom && <span className="marque-nom">Kanabiz</span>}
    </span>
  );
}
