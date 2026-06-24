// URL de téléchargement du binaire Windows, hébergé sur Supabase Storage
// (bucket public « downloads »). Pour publier une nouvelle version : remplacer
// le fichier WyrmForge.exe dans le bucket — l'URL ne change jamais.
// Centralisée ici car réutilisée par Nav, Hero et FinalCTA.
export const WINDOWS_DOWNLOAD_URL =
  'https://cuscgmgqakxnfwnsrhhv.supabase.co/storage/v1/object/public/downloads/WyrmForge.exe'
