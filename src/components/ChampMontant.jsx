// Champ de saisie de montant en euros, optimisé mobile (clavier décimal).
// Conserve la saisie brute (string) ; la conversion se fait via parseMontant.
export default function ChampMontant({ label, valeur, onChange, autoFocus }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0,00"
        value={valeur}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
