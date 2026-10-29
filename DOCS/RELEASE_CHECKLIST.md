# Orkobi — Fiche de publication

> À compléter pour chaque version. Ne pas publier automatiquement sur la seule base d'un `git pull`.

Procédure : [stratégie Git et synchronisation des versions](VERSIONING.md).
Cette fiche ne constitue pas une autorisation de push, de publication ou de déploiement.

- Version cible : `X.Y.Z[-beta.N|-rc.N]`
- Canal : `dev` / `beta` / `stable`
- Branche source :
- Commit Git SHA :
- Tag Git (si publication) :
- Responsable de validation :
- Date :

## Validation

- [ ] Version du manifeste vérifiée
- [ ] Dix manifests privés synchronisés avec la racine, version OpenAPI et assertion cohérentes
- [ ] PR vers la bonne branche examinée et fusion approuvée
- [ ] CI / tests / builds verts
- [ ] Tests de sécurité et d'isolation entre organisations validés
- [ ] Migrations testées sur des données anonymisées
- [ ] Sauvegarde et stratégie de restauration validées
- [ ] Compatibilité Core / SDK / plugins contrôlée
- [ ] CHANGELOG et notes de version préparés
- [ ] Publication approuvée
- [ ] Push des branches/tags et déploiement explicitement autorisés
- [ ] Tag immuable créé et poussé (si applicable)
- [ ] Déploiement vérifié avec la version et le commit attendus

## Retour d'expérience

- Problèmes rencontrés :
- Actions correctives :
- Décision : publié / reporté / annulé
