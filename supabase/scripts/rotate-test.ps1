# ============================================================================
#  Rotation PRAC_WEBHOOK_SECRET  --  projet TEST (gyjcdswpybrhesarompg)
#
#  Le token est genere DANS ce script. Il n'est jamais affiche a l'ecran,
#  jamais ecrit sur disque, jamais present dans l'historique de commande.
#  Il ne sort que par le PRESSE-PAPIER, sous forme du SQL pret a lancer.
#
#  PRE-REQUIS : le SQL Editor Supabase doit deja etre OUVERT sur le projet
#               TEST (gyjcdswpybrhesarompg), onglet de requete vide, curseur
#               dedans. Le script s'arrete pour te le faire confirmer.
# ============================================================================
$REF  = 'gyjcdswpybrhesarompg'
$REPO = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

Write-Host ""
Write-Host "  ROTATION PRAC_WEBHOOK_SECRET -- projet TEST ($REF)" -ForegroundColor Cyan
Write-Host "  La PROD (cuscgmgqakxnfwnsrhhv) n'est PAS touchee par ce script." -ForegroundColor Cyan
Write-Host ""
Write-Host "  Avant de continuer, verifie que :" -ForegroundColor Yellow
Write-Host "    - le SQL Editor est ouvert sur le projet TEST (pas la prod)"
Write-Host "    - un onglet de requete VIDE est actif, curseur dedans"
Write-Host "    - tu es pret a faire Ctrl+A / Ctrl+V / Ctrl+Enter sans delai"
Write-Host ""
$go = Read-Host "  Tape OUI pour lancer la bascule"
if ($go -ne 'OUI') { Write-Host "  Annule. Rien n'a ete modifie." -ForegroundColor Red; exit 1 }

# --- Generation du token (256 bits, RNG cryptographique) --------------------
$b = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
$tok = ($b | ForEach-Object { $_.ToString('x2') }) -join ''
if ($tok -notmatch '^[0-9a-f]{64}$') { Write-Host "Generation invalide - ABANDON." -ForegroundColor Red; exit 1 }

Set-Location $REPO

# --- [1/3] Secret Edge Function ---------------------------------------------
Write-Host ""
Write-Host "  [1/3] supabase secrets set ..." -ForegroundColor Cyan
supabase secrets set "PRAC_WEBHOOK_SECRET=$tok" --project-ref $REF |
    ForEach-Object { $_ -replace '[0-9a-f]{64}', '<redacted>' }
if (-not $?) {
    Write-Host "  ECHEC. Rien de casse : le trigger envoie toujours l'ancien token." -ForegroundColor Red
    Remove-Variable tok; exit 1
}

# --- [2/3] Redeploiement (rend le basculement EF deterministe) --------------
Write-Host "  [2/3] supabase functions deploy prac-notify ..." -ForegroundColor Cyan
supabase functions deploy prac-notify --project-ref $REF
if (-not $?) {
    Write-Host "  ECHEC du deploy. Le secret EF est change mais les isolates chauds" -ForegroundColor Red
    Write-Host "  gardent peut-etre l'ancien env. Relance le script." -ForegroundColor Red
    Remove-Variable tok; exit 1
}

# --- [3/3] SQL de bascule Vault -> presse-papier ----------------------------
$sql = @"
do `$`$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'prac_webhook_secret';
  if v_id is null then
    raise exception 'prac_webhook_secret absent de Vault - NE PAS CONTINUER.';
  end if;
  perform vault.update_secret(v_id, '$tok');
end
`$`$;
"@
Set-Clipboard -Value $sql
Remove-Variable tok, b, sql

Write-Host ""
Write-Host "  ===============================================================" -ForegroundColor Yellow
Write-Host "     SQL PRET DANS LE PRESSE-PAPIER" -ForegroundColor Yellow
Write-Host "     -> SQL Editor : Ctrl+A  puis  Ctrl+V  puis  Ctrl+Enter" -ForegroundColor Yellow
Write-Host "" 
Write-Host "     LA FENETRE 401 EST OUVERTE A PARTIR DE MAINTENANT." -ForegroundColor Red
Write-Host "  ===============================================================" -ForegroundColor Yellow
Write-Host ""
