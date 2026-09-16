import type { Dream } from '../types';

/**
 * Merge persisted local dreams with cloud sources without dropping local-only
 * dreams created by a Firebase/demo session that cannot write to Supabase.
 * Cloud records win when the same Dream ID exists in multiple sources.
 */
export function mergePersistedDreams(
  localDreams: Dream[],
  supabaseDreams: Dream[],
  firestoreDreams: Dream[],
): Dream[] {
  const byId = new Map<string, Dream>();

  const mergeEntry = (existing: Dream | undefined, incoming: Dream): Dream => {
    if (!existing) return incoming;
    return {
      ...existing,
      ...incoming,
      // If incoming record has an explicit cardColor, it wins; otherwise keep existing
      cardColor: incoming.cardColor || existing.cardColor,
      cardBorderColor: incoming.cardBorderColor || existing.cardBorderColor,
      cardTextColor: incoming.cardTextColor || existing.cardTextColor,
      cardGradient: incoming.cardGradient || existing.cardGradient,
      surfaces: {
        ...existing.surfaces,
        ...incoming.surfaces,
      },
    };
  };

  for (const dream of localDreams) byId.set(dream.id, mergeEntry(byId.get(dream.id), dream));
  for (const dream of firestoreDreams) byId.set(dream.id, mergeEntry(byId.get(dream.id), dream));
  for (const dream of supabaseDreams) byId.set(dream.id, mergeEntry(byId.get(dream.id), dream));

  return [...byId.values()];
}
