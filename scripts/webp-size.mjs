// Partagé par `guide-shots.mjs` et par `src/lib/guide-shots.test.ts`.

/**
 * Dimensions lues dans l'en-tête RIFF/WebP, sans dépendance : ce script tourne à
 * CHAQUE build Vercel, et `sharp` n'y est qu'une dépendance optionnelle de Next.
 * Trois variantes de flux : VP8X (étendu), VP8 (avec perte), VP8L (sans perte).
 */
export function webpSize(buf, file) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error(`guide-shots : ${file} n'est pas un WebP valide`)
  }
  const chunk = buf.toString('ascii', 12, 16)
  if (chunk === 'VP8X') {
    return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) }
  }
  if (chunk === 'VP8 ') {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff }
  }
  if (chunk === 'VP8L') {
    const bits = buf.readUInt32LE(21)
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }
  }
  throw new Error(`guide-shots : ${file}, bloc WebP inconnu « ${chunk} »`)
}
