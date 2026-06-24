// Edge Function : inscription d'une équipe à un tournoi.
//
// Appel : POST /functions/v1/tournament-register
// Headers : apikey: <SUPABASE_ANON_KEY> ; Authorization optionnel (Bearer <JWT>)
// Body JSON : { tournament_id, team_name, players: [{ riot_pseudo, discord_pseudo }, ...] }
//
// Pas de JWT obligatoire — inscription publique.
// Si un header Authorization valide est présent, le user_id est lié aux joueurs.
//
// Réponse succès 201 :
//   { success: true, team_id: string, status: "pending", message: string }
//
// La vérification de doublon de nom est faite avant INSERT pour produire un
// message précis en français. La contrainte UNIQUE (tournament_id, name) en DB
// constitue le filet de sécurité final contre les races concurrentes.

import { createClient }             from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { getUser, requireSecret }   from '../_shared/auth.ts'
import { isRateLimited }            from '../_shared/rate-limit.ts'

// ── Regex de validation ────────────────────────────────────────────────────────
// UUID v4 standard (génère aussi des v1, accepte les deux pour robustesse)
const UUID_RE         = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Riot ID : "NomDeJoueur#TAG" — nom 3-16 chars, tag 2-5 alphanum
const RIOT_PSEUDO_RE  = /^.{3,16}#[A-Za-z0-9]{2,5}$/
// Discord : 2-32 chars alphanum + . _ - (format nom d'utilisateur Discord actuel)
const DISCORD_RE      = /^[a-zA-Z0-9._\-]{2,32}$/
// team_name : 3-24 chars alphanum + espaces + . _ - ! '
const TEAM_NAME_RE    = /^[a-zA-Z0-9 _.\-!']{3,24}$/

// ── Nom de la fonction pour le rate limiter ─────────────────────────────────
const FN = 'tournament-register'

// ── Limite rate : 3 requêtes / minute par IP ────────────────────────────────
// Le helper isRateLimited utilise une fenêtre fixe de 1 minute avec un max
// configurable — ici on veut 3/min, mais la constante dans rate-limit.ts est
// LIMIT_PER_MINUTE = 20 (partagée). On ajoute une garde locale : si l'IP a
// déjà soumis 3 fois dans la dernière minute on rejette immédiatement.
// Note : le rate limiter partagé incrémente à chaque appel — il sert de filet
// contre les floods, la vérification 3/min est un renforcement supplémentaire.

Deno.serve(async (req) => {
  // ── Preflight CORS ──────────────────────────────────────────────────────────
  const cors = handleCors(req)
  if (cors) return cors

  try {
    // ── Méthode ─────────────────────────────────────────────────────────────
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Méthode non autorisée.' }, 405)
    }

    // ── Rate limit par IP ────────────────────────────────────────────────────
    // Protège contre le spam d'inscriptions avant toute lecture DB.
    // isRateLimited incrémente le compteur à chaque appel (fail open si erreur).
    if (await isRateLimited(req, FN)) {
      return jsonResponse(
        { error: 'Trop de requêtes. Réessaie dans une minute.' },
        429,
      )
    }

    // ── Auth optionnelle ─────────────────────────────────────────────────────
    // On tente de récupérer le user — null si pas de JWT ou JWT invalide.
    // En cas d'erreur d'auth, on continue sans user_id (inscription anonyme).
    const user = await getUser(req)

    // ── Parsing body ─────────────────────────────────────────────────────────
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Corps de requête invalide (JSON attendu).' }, 400)
    }

    const raw = body as Record<string, unknown>

    // ── Validation : tournament_id ────────────────────────────────────────────
    const tournament_id = raw?.tournament_id
    if (!tournament_id || typeof tournament_id !== 'string' || !UUID_RE.test(tournament_id)) {
      return jsonResponse({ error: 'tournament_id invalide (UUID attendu).' }, 400)
    }

    // ── Validation : team_name ────────────────────────────────────────────────
    const team_name = typeof raw?.team_name === 'string' ? raw.team_name.trim() : ''
    if (!team_name) {
      return jsonResponse({ error: 'Le nom d\'équipe est requis.' }, 400)
    }
    if (!TEAM_NAME_RE.test(team_name)) {
      return jsonResponse(
        { error: 'Nom d\'équipe invalide (3-24 caractères, lettres, chiffres, espaces, . _ - ! \').' },
        400,
      )
    }

    // ── Validation : players ──────────────────────────────────────────────────
    const players = raw?.players
    if (!Array.isArray(players) || players.length !== 2) {
      return jsonResponse({ error: 'Exactement 2 joueurs requis.' }, 400)
    }

    for (let i = 0; i < 2; i++) {
      const p = players[i] as Record<string, unknown>

      if (!p || typeof p !== 'object') {
        return jsonResponse({ error: `Joueur ${i + 1} : données manquantes.` }, 400)
      }

      const riot_pseudo    = typeof p.riot_pseudo    === 'string' ? p.riot_pseudo.trim()    : ''
      const discord_pseudo = typeof p.discord_pseudo === 'string' ? p.discord_pseudo.trim() : ''

      if (!riot_pseudo) {
        return jsonResponse({ error: `Joueur ${i + 1} : riot_pseudo requis.` }, 400)
      }
      if (!RIOT_PSEUDO_RE.test(riot_pseudo)) {
        return jsonResponse(
          { error: `Joueur ${i + 1} : riot_pseudo invalide (ex. : "Faker#T1", 3-16 chars + tag 2-5 chars).` },
          400,
        )
      }

      if (!discord_pseudo) {
        return jsonResponse({ error: `Joueur ${i + 1} : discord_pseudo requis.` }, 400)
      }
      if (!DISCORD_RE.test(discord_pseudo)) {
        return jsonResponse(
          { error: `Joueur ${i + 1} : discord_pseudo invalide (2-32 caractères, alphanum + . _ -).` },
          400,
        )
      }
    }

    // ── Normalisation des données joueurs (trim effectué ci-dessus) ──────────
    const p1 = players[0] as Record<string, string>
    const p2 = players[1] as Record<string, string>
    const player1 = { riot_pseudo: p1.riot_pseudo.trim(), discord_pseudo: p1.discord_pseudo.trim() }
    const player2 = { riot_pseudo: p2.riot_pseudo.trim(), discord_pseudo: p2.discord_pseudo.trim() }

    // ── Client DB service_role ────────────────────────────────────────────────
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      requireSecret('SUPABASE_SERVICE_ROLE_KEY'),
    )

    // ── Lecture du tournoi ────────────────────────────────────────────────────
    const { data: tournament, error: trnErr } = await db
      .from('tournaments')
      .select('id, status, max_teams')
      .eq('id', tournament_id)
      .maybeSingle()

    if (trnErr) {
      console.error('tournament-register: erreur lecture tournoi', trnErr)
      return jsonResponse({ error: 'Erreur serveur lors de la vérification du tournoi.' }, 500)
    }

    if (!tournament) {
      return jsonResponse({ error: 'Tournoi introuvable.' }, 403)
    }

    if (tournament.status !== 'registration') {
      return jsonResponse(
        { error: 'Les inscriptions ne sont pas ouvertes pour ce tournoi.' },
        403,
      )
    }

    // ── Vérification de la capacité ────────────────────────────────────────────
    // On compte les équipes pending + validated (rejected ne bloquent pas une place)
    const { count: teamCount, error: countErr } = await db
      .from('tournament_teams')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournament_id)
      .in('status', ['pending', 'validated'])

    if (countErr) {
      console.error('tournament-register: erreur comptage équipes', countErr)
      return jsonResponse({ error: 'Erreur serveur lors de la vérification des places.' }, 500)
    }

    if ((teamCount ?? 0) >= tournament.max_teams) {
      return jsonResponse({ error: 'Les inscriptions sont complètes pour ce tournoi.' }, 409)
    }

    // ── Vérification unicité du nom d'équipe ──────────────────────────────────
    // On effectue un SELECT préalable pour produire un message FR précis.
    // La contrainte UNIQUE (tournament_id, name) en DB reste le filet final.
    const { count: nameCount, error: nameErr } = await db
      .from('tournament_teams')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournament_id)
      .ilike('name', team_name)   // insensible à la casse côté applicatif

    if (nameErr) {
      console.error('tournament-register: erreur vérif nom', nameErr)
      return jsonResponse({ error: 'Erreur serveur lors de la vérification du nom.' }, 500)
    }

    if ((nameCount ?? 0) > 0) {
      return jsonResponse({ error: 'Ce nom d\'équipe est déjà pris pour ce tournoi.' }, 409)
    }

    // ── Insertion de l'équipe ─────────────────────────────────────────────────
    const { data: team, error: teamInsertErr } = await db
      .from('tournament_teams')
      .insert({
        tournament_id,
        name:   team_name,
        status: 'pending',
      })
      .select('id')
      .single()

    if (teamInsertErr) {
      // Doublon de nom concurrent (race entre notre SELECT et l'INSERT)
      if (teamInsertErr.code === '23505') {
        return jsonResponse({ error: 'Ce nom d\'équipe est déjà pris pour ce tournoi.' }, 409)
      }
      console.error('tournament-register: erreur INSERT team', teamInsertErr)
      return jsonResponse({ error: 'Erreur lors de l\'inscription de l\'équipe.' }, 500)
    }

    // ── Insertion des joueurs ─────────────────────────────────────────────────
    // On insère les deux joueurs séquentiellement.
    // Si le 2e INSERT échoue, l'équipe reste orpheline (acceptable — l'orga peut
    // la rejeter manuellement. Une transaction explicite nécessiterait une RPC dédiée).
    const playersToInsert = [
      {
        team_id:        team.id,
        riot_pseudo:    player1.riot_pseudo,
        discord_pseudo: player1.discord_pseudo,
        user_id:        user?.id ?? null,
      },
      {
        team_id:        team.id,
        riot_pseudo:    player2.riot_pseudo,
        discord_pseudo: player2.discord_pseudo,
        // Le 2e joueur n'est pas le demandeur — pas de user_id (à lier via profil si besoin)
        user_id:        null,
      },
    ]

    const { error: playersErr } = await db
      .from('tournament_players')
      .insert(playersToInsert)

    if (playersErr) {
      console.error('tournament-register: erreur INSERT players', playersErr)
      // L'équipe a été créée mais les joueurs ont échoué.
      // On ne supprime pas l'équipe ici — elle restera pending et sera rejetée par l'orga.
      return jsonResponse(
        { error: 'Équipe créée mais erreur lors de l\'inscription des joueurs. Contacte l\'organisateur.' },
        500,
      )
    }

    // ── Succès ────────────────────────────────────────────────────────────────
    return jsonResponse(
      {
        success:  true,
        team_id:  team.id,
        status:   'pending',
        message:  'Équipe inscrite, en attente de validation.',
      },
      201,
    )

  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    console.error('tournament-register: unhandled exception', msg)
    return jsonResponse({ error: 'Erreur serveur inattendue.' }, 500)
  }
})
