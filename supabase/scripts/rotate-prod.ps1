# ============================================================================
#  Rotation PRAC_WEBHOOK_SECRET  --  projet PROD (cuscgmgqakxnfwnsrhhv)
#
#  Le token est genere DANS ce script, independamment de celui de test :
#  32 octets de RNG cryptographique, donc structurellement different.
#  Il n'est jamais affiche, jamais ecrit sur disque, jamais en historique.
#  Il ne sort que par le PRESSE-PAPIER, sous forme du SQL pret a lancer.
#
#  PRE-REQUIS : SQL Editor Supabase OUVERT sur le projet PROD, onglet de
#               requete VIDE, curseur dedans.
#  pg_net NE REJOUE PAS : ce qui tombe dans la fenetre est perdu, pas
#  retarde. A jouer a une heure creuse.
# ============================================================================
$REF  = 'cuscgmgqakxnfwnsrhhv'
$REPO = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

Write-Host ""
Write-Host "  ############################################################" -ForegroundColor Red
Write-Host "  #   ROTATION PRAC_WEBHOOK_SECRET -- *** P R O D ***         #" -ForegroundColor Red
Write-Host "  #   Projet : $REF                      #" -ForegroundColor Red
Write-Host "  ############################################################" -ForegroundColor Red
Write-Host ""

# --- Garde-fou 1 : arbre de travail propre sur les chemins deployes ---------
# `functions deploy` expedie l'arbre LOCAL, pas le dernier commit : une
# modification non commitee partirait en prod avec la rotation.
$dirty = git -C $REPO status --porcelain -- supabase/functions/prac-notify supabase/functions/_shared
if ($dirty) {
    Write-Host "  ABANDON : modifications non commitees sur les chemins deployes :" -ForegroundColor Red
    $dirty | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
    Write-Host "  Commit, stash ou restaure avant de rejouer. RIEN n'a ete modifie."
    exit 1
}
$head = git -C $REPO log --oneline -1
$brch = git -C $REPO rev-parse --abbrev-ref HEAD
Write-Host "  Arbre de travail : propre" -ForegroundColor Green
Write-Host "  Code deploye     : $head  (branche $brch)"
Write-Host ""

# --- Garde-fou 2 : confirmation explicite -----------------------------------
Write-Host "  Verifie que :" -ForegroundColor Yellow
Write-Host "    - le SQL Editor est ouvert sur la PROD, onglet VIDE, curseur dedans"
Write-Host "    - c'est bien une heure creuse (pg_net ne rejoue pas)"
Write-Host "    - tu es pret a faire Ctrl+A / Ctrl+V / Ctrl+Enter sans delai"
Write-Host ""
$go = Read-Host "  Tape exactement  ROTATION PROD  pour lancer la bascule"
if ($go -ne 'ROTATION PROD') {
    Write-Host "  Annule. RIEN n'a ete modifie." -ForegroundColor Red
    exit 1
}

# --- Generation du token (256 bits) -----------------------------------------
$b = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
$tok = ($b | ForEach-Object { $_.ToString('x2') }) -join ''
if ($tok -notmatch '^[0-9a-f]{64}$') { Write-Host "  Generation invalide - ABANDON." -ForegroundColor Red; exit 1 }

Set-Location $REPO

# --- [1/3] Secret Edge Function ---------------------------------------------
Write-Host ""
Write-Host "  [1/3] supabase secrets set  (PROD)..." -ForegroundColor Cyan
supabase secrets set "PRAC_WEBHOOK_SECRET=$tok" --project-ref $REF |
    ForEach-Object { $_ -replace '[0-9a-f]{64}', '<redacted>' }
if (-not $?) {
    Write-Host "  ECHEC. Rien de casse : le trigger envoie toujours l'ancien token." -ForegroundColor Red
    Remove-Variable tok; exit 1
}

# --- [2/3] Redeploiement (rend le basculement EF deterministe) --------------
Write-Host "  [2/3] supabase functions deploy prac-notify  (PROD)..." -ForegroundColor Cyan
supabase functions deploy prac-notify --project-ref $REF
if (-not $?) {
    Write-Host "  ECHEC du deploy. Le secret EF est change mais les isolates chauds" -ForegroundColor Red
    Write-Host "  gardent peut-etre l'ancien env : etat indetermine." -ForegroundColor Red
    Write-Host "  -> Relance ce script pour regenerer et realigner les deux cotes." -ForegroundColor Red
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
Write-Host "     -> SQL Editor PROD : Ctrl+A  puis  Ctrl+V  puis  Ctrl+Enter" -ForegroundColor Yellow
Write-Host ""
Write-Host "     LA FENETRE 401 EST OUVERTE A PARTIR DE MAINTENANT." -ForegroundColor Red
Write-Host "  ===============================================================" -ForegroundColor Yellow
Write-Host ""
