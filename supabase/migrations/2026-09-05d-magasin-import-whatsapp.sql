-- Migration — import des clôtures depuis WhatsApp : fonction PROPRE À UN MAGASIN.
-- Le format de message (« CA · CB · Moro · Chromes · Livraisons · Caisse départ »)
-- est l'habitude d'une équipe précise ; on n'affiche l'onglet Import → WhatsApp
-- et le bouton « Coller un message WhatsApp » (Clôture) que pour les magasins où
-- ce drapeau est posé (par le superadmin, `magasins` n'étant modifiable que par lui).
alter table public.magasins add column if not exists import_whatsapp boolean not null default false;

-- Magasin originel (Weedland) : activé.
update public.magasins set import_whatsapp = true where id = '4dc2bd4b-92a0-4e26-a747-f780ac1e92af';
