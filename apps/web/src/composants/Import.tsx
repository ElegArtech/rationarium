import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import * as api from "../api/imports.js";
import { messageErreur } from "../api/erreurs.js";
import { Fenetre } from "./fenetre.js";
import { useMessages } from "./messages.js";
import "./import.css";

/**
 * `RG-IMP-02` à `RG-IMP-06` — la fenêtre d'import, partagée par tous les types.
 *
 * **Trois temps, toujours les mêmes** : choisir le fichier, **prévisualiser**,
 * exécuter. La prévisualisation n'est pas une étape de confort : sur un import
 * en masse, c'est la différence entre une correction et une restauration.
 *
 * Le compte rendu distingue **trois familles** (`RG-IMP-04`) : importés,
 * ignorés (doublons), en erreur. Fondre les doublons dans les erreurs ferait
 * paniquer sur un fichier rejoué ; les fondre dans les importés ferait croire à
 * un import complet.
 */

const MAX_APERCU = 5;

export function FenetreImport({
  type,
  titre,
  colonnes,
  modeProjet = false,
  volumes,
  surExecuter,
  surFermer,
}: {
  type: api.TypeImport;
  titre: string;
  /** Les colonnes documentées, dans l'ordre du modèle. */
  colonnes: string[];
  /** L'import projet complet offre deux modes ; les autres, non. */
  modeProjet?: boolean;
  volumes?: { jalons: number; taches: number; sousTaches: number } | undefined;
  surExecuter: (contenu: string, mode: "ajouter" | "remplacer") => Promise<api.CompteRendu>;
  surFermer: () => void;
}) {
  const { t } = useTranslation("imports");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();

  const [contenu, setContenu] = useState<string | null>(null);
  const [nomFichier, setNomFichier] = useState("");
  const [mode, setMode] = useState<"ajouter" | "remplacer">("ajouter");
  const [confirme, setConfirme] = useState(false);
  const [rendu, setRendu] = useState<api.CompteRendu | null>(null);

  const previsualisation = useMutation({
    mutationFn: (texte: string) => api.apercu(type, texte),
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("echecApercu"))),
  });

  const execution = useMutation({
    mutationFn: () => surExecuter(contenu!, mode),
    onSuccess: (r) => {
      setRendu(r);
      if (r.erreurs.length === 0) annoncer("ok", t("importTermine", { n: r.importes }));
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("echecImport"))),
  });

  const lire = async (fichier: File) => {
    const texte = await fichier.text();
    setNomFichier(fichier.name);
    setContenu(texte);
    setRendu(null);
    previsualisation.mutate(texte);
  };

  const apercu = previsualisation.data;
  const bloquant = mode === "remplacer" && (apercu?.erreurs.length ?? 0) > 0;

  /**
   * `RG-GEN-08` — **le serveur nomme la situation, le client la formule.**
   *
   * Le compte rendu d'import était le seul endroit du produit où le serveur
   * rédigeait des phrases destinées à l'écran : une session anglaise lisait
   * « Row 6 — aucun compte ne porte l'adresse « … » ». Le serveur rend
   * désormais `{ cle, params, message }` ; il reste à les lire.
   *
   * **Le repli est indispensable** : sans `defaultValue`, une clé absente du
   * catalogue s'afficherait telle quelle — `imports:motifs.chevauchement` à la
   * place d'une phrase. Le message français du serveur est le dernier recours,
   * pas la vérité affichable.
   *
   * i18n-familles: imports:motifs.
   */
  const formuler = (e: api.LigneErreur): string =>
    t(e.cle, { ...e.params, defaultValue: e.message });

  /*
   * Le contrat déclare `ignorees` requis — le serveur le rend depuis toujours.
   * Le repli ne parle pas au serveur mais au BANC : un jeu d'essai calqué sur
   * l'ancienne forme ferait tomber la fenêtre entière sur un `.length` de rien,
   * et l'écran blanc ne dirait pas d'où il vient.
   */
  const ignorees = rendu?.ignorees ?? [];

  return (
    <Fenetre
      ouverte
      surFermeture={surFermer}
      categorie={t("categorie")}
      titre={titre}
      large
      actions={
        <>
          <Button className="chip-btn" onPress={surFermer}>
            {t("fermer")}
          </Button>
          {rendu === null ? (
            <Button
              className="btn btn-primary"
              isDisabled={
                !contenu ||
                previsualisation.isPending ||
                bloquant ||
                (mode === "remplacer" && !confirme)
              }
              isPending={execution.isPending}
              onPress={() => execution.mutate()}
            >
              {t("executer")}
            </Button>
          ) : null}
        </>
      }
    >
      {/* `RG-IMP-02` — le format documenté, et le modèle téléchargeable. */}
      <div className="imp-format">
        <p className="imp-titre">{t("formatAttendu")}</p>
        <p className="imp-colonnes">{colonnes.join(" · ")}</p>
        <a className="chip-btn" href={api.adresseModele(type)} download>
          {t("telechargerModele")}
        </a>
      </div>

      <div className="imp-fichier">
        <label className="imp-label" htmlFor="imp-input">
          {t("choisirFichier")}
        </label>
        <input
          id="imp-input"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const fichier = e.target.files?.[0];
            if (fichier) void lire(fichier);
          }}
        />
        {nomFichier ? <span className="imp-nom">{nomFichier}</span> : null}
      </div>

      {modeProjet ? (
        <div className="imp-modes">
          {/* Les deux modes sont présentés CÔTE À CÔTE, avec leur conséquence
              écrite : le brief l'exige, et « remplacer » n'a pas de sens sans
              savoir ce qu'il remplace. */}
          <label className={`imp-mode${mode === "ajouter" ? " is-on" : ""}`}>
            <input
              type="radio"
              name="mode"
              checked={mode === "ajouter"}
              onChange={() => {
                setMode("ajouter");
                setConfirme(false);
              }}
            />
            <span>
              <span className="imp-mode-n">{t("modeAjouter")}</span>
              <span className="imp-mode-d">{t("modeAjouterAide")}</span>
            </span>
          </label>
          <label className={`imp-mode${mode === "remplacer" ? " is-on" : ""}`}>
            <input
              type="radio"
              name="mode"
              checked={mode === "remplacer"}
              onChange={() => setMode("remplacer")}
            />
            <span>
              <span className="imp-mode-n">{t("modeRemplacer")}</span>
              <span className="imp-mode-d">{t("modeRemplacerAide")}</span>
            </span>
          </label>
        </div>
      ) : null}

      {/* `RG-GEN-01` — l'action destructrice est confirmée EN CHIFFRES. */}
      {modeProjet && mode === "remplacer" ? (
        /* `.alert-error`, et non `.alert-danger` : le socle ne connaît pas le
           second, et une classe sans règle en face est inerte sans que rien ne
           le dise. L'avertissement de `RG-GEN-01` se rendait donc en boîte nue
           — ni fond, ni couleur, et une bordure prise à `currentColor` faute de
           teinte déclarée — sur l'écran même qui annonce une suppression. */
        <div className="alert alert-error" role="alert">
          <span className="alert-icon" aria-hidden="true">
            !
          </span>
          <span>
            <strong>{t("remplacerTitre")}</strong> {t("remplacerTexte")}
            {volumes ? (
              <span className="imp-volumes">
                {t("remplacerVolumes", {
                  jalons: volumes.jalons,
                  taches: volumes.taches,
                  sousTaches: volumes.sousTaches,
                })}
              </span>
            ) : null}
            <label className="check imp-confirme">
              <input
                type="checkbox"
                checked={confirme}
                onChange={(e) => setConfirme(e.target.checked)}
              />
              <span>{t("remplacerConfirmer")}</span>
            </label>
          </span>
        </div>
      ) : null}

      {previsualisation.isPending ? <p className="empty">{t("analyse")}</p> : null}

      {/* `RG-IMP-03` — la prévisualisation, avant toute écriture. */}
      {apercu && rendu === null ? (
        <div className="imp-apercu">
          <p className="imp-titre">{t("detecte", { n: apercu.total })}</p>

          {apercu.total > 0 ? (
            <div className="imp-table">
              <div className="imp-row imp-head" aria-hidden="true">
                {colonnes.slice(0, 4).map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
              {apercu.lignes.slice(0, MAX_APERCU).map((ligne, i) => (
                <div className="imp-row" key={i}>
                  {colonnes.slice(0, 4).map((c) => (
                    <span key={c}>{ligne[c] ?? ""}</span>
                  ))}
                </div>
              ))}
              {apercu.total > MAX_APERCU ? (
                <p className="imp-reste">{t("etAutres", { n: apercu.total - MAX_APERCU })}</p>
              ) : null}
            </div>
          ) : null}

          {apercu.erreurs.length > 0 ? (
            <div className="imp-erreurs">
              <p className="imp-titre">{t("erreursDetectees", { n: apercu.erreurs.length })}</p>
              <ul>
                {apercu.erreurs.slice(0, 10).map((e) => (
                  <li key={`${e.ligne}-${e.cle}`}>
                    {/* Le numéro de ligne est le seul repère retrouvable dans
                        un tableur : « 3 erreurs » sans lui fait relire tout. */}
                    {t("ligneN", { n: e.ligne })} — {formuler(e)}
                  </li>
                ))}
              </ul>
              {bloquant ? <p className="imp-bloquant">{t("remplacerBloque")}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* `RG-IMP-04` — le compte rendu, en trois familles. */}
      {rendu ? (
        <div className="imp-rendu">
          <div className="imp-bilan">
            <span className="imp-chiffre is-ok">{t("importes", { n: rendu.importes })}</span>
            <span className="imp-chiffre">{t("ignores", { n: rendu.ignores })}</span>
            <span className={`imp-chiffre${rendu.erreurs.length > 0 ? " is-err" : ""}`}>
              {t("enErreur", { n: rendu.erreurs.length })}
            </span>
          </div>
          {/*
            * **Le compte rendu ne disait jamais ce qui avait été créé.** Trois
            * chiffres — importés, ignorés, en erreur — et pas une phrase disant
            * de QUOI il s'agit : « 4 importés » ne dit pas quatre comptes,
            * quatre congés ou quatre jalons. Le nombre existait ; il lui
            * manquait son nom, et le type de l'import le porte.
            */}
          <p className="imp-note">{t(`crees.${type}`, { n: rendu.importes })}</p>

          {/*
            * `RG-IMP-04` — un ignoré porte son MOTIF, au même format qu'une
            * erreur. La note générique disait « des entrées déjà présentes » :
            * redondante avec le chiffre, et fausse pour le chevauchement de
            * congé (`RG-CNG-32`), qui n'est pas un doublon. Deux collisions
            * distinctes — l'adresse et l'identifiant — produisaient le même
            * silence, et le lecteur ne savait pas quelle colonne corriger.
            *
            * Le gris, pas le rouge : une ligne ignorée n'est pas un échec.
            */}
          {ignorees.length > 0 ? (
            <div className="imp-ignorees">
              <p className="imp-note">{t("ignoresTitre")}</p>
              <ul>
                {ignorees.slice(0, 10).map((e) => (
                  <li key={`${e.ligne}-${e.cle}`}>
                    {t("ligneN", { n: e.ligne })} — {formuler(e)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {rendu.erreurs.length > 0 ? (
            <ul className="imp-erreurs">
              {rendu.erreurs.slice(0, 10).map((e) => (
                <li key={`${e.ligne}-${e.cle}`}>
                  {t("ligneN", { n: e.ligne })} — {formuler(e)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Fenetre>
  );
}

/** Les volumes du projet, chargés à l'ouverture de la fenêtre d'import. */
export function useVolumesProjet(projetId: string) {
  return useQuery({
    queryKey: ["imports", "volumes", projetId],
    queryFn: () => api.volumesRemplacement(projetId),
  });
}
