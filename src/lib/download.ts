// URL de téléchargement de l'installateur Windows, hébergé sur Supabase Storage
// (bucket public « downloads », dossier `velopack`). Centralisée ici car réutilisée
// par Nav, Hero, FinalCTA, Pricing, Footer et la page /about.
//
// ⚠️ Cette URL est STABLE et ne doit PAS être versionnée à la main : le nom de
// fichier produit par `vpk pack` ne contient pas le numéro de version, et le
// workflow release.yml du dépôt de l'app le ré-uploade en `x-upsert` à chaque
// tag de production. Le lien pointe donc toujours sur le dernier Setup.exe publié.
//
// Il remplace l'ancien `downloads/WyrmForge.exe` — un exécutable single-file
// déposé à la main dans le bucket, que plus aucun workflow ne mettait à jour
// (il datait du 28/05/2026 alors que l'app en était à la 1.0.2).
//
// ⚠️ Ne JAMAIS le faire pointer vers une Release GitHub : le dépôt de l'app est
// privé, ses assets exigent une authentification et sont donc inaccessibles à un
// visiteur — c'est précisément ce qui rendait l'ancienne auto-update inopérante.
//
// Canal `win` = production. Le canal `preview` (tags v*-*) publie sous d'autres
// noms de fichiers et ne doit jamais être exposé sur le site.
export const WINDOWS_DOWNLOAD_URL =
  'https://cuscgmgqakxnfwnsrhhv.supabase.co/storage/v1/object/public/downloads/velopack/WyrmForge-win-Setup.exe'
