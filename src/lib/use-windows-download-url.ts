'use client'

import { useEffect, useState } from 'react'
import {
  VELOPACK_STABLE_FEED_URL,
  WINDOWS_DOWNLOAD_URL,
  latestStableVersion,
  windowsDownloadUrl,
} from '@/lib/download'

// Une seule lecture du flux par chargement de page, partagée par tous les liens
// (Nav, Hero, Pricing, FinalCTA, Footer, /about, /guide). Un échec n'est pas mis en
// cache comme définitif : la promesse est oubliée et une navigation suivante retente.
let versionPromise: Promise<string | null> | null = null

function loadStableVersion(): Promise<string | null> {
  versionPromise ??= fetch(VELOPACK_STABLE_FEED_URL, { cache: 'no-store' })
    .then(res => (res.ok ? res.json() : null))
    .then(latestStableVersion)
    .catch(() => null)
    .then(v => {
      if (v === null) versionPromise = null
      return v
    })
  return versionPromise
}

/**
 * Lien de téléchargement de l'installateur Windows, nom de fichier versionné
 * (`WyrmForge-1.0.23-Setup.exe`) dès que la version publiée est connue.
 *
 * Rend d'abord `WINDOWS_DOWNLOAD_URL` (rendu serveur, premier rendu client) : le lien
 * fonctionne toujours, seul le nom du fichier enregistré reste neutre si le flux est
 * injoignable ou si le clic précède sa lecture.
 */
export function useWindowsDownloadUrl(): string {
  const [url, setUrl] = useState(WINDOWS_DOWNLOAD_URL)
  useEffect(() => {
    let alive = true
    loadStableVersion().then(v => {
      if (alive) setUrl(windowsDownloadUrl(v))
    })
    return () => { alive = false }
  }, [])
  return url
}
