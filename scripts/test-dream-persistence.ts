import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergePersistedDreams } from '../src/utils/dreamPersistence.ts';

test('keeps local-only Dreams when cloud rehydration has no matching record', () => {
  const localDream = { id: 'local-dream-1', title: 'Purple city dream' } as any;
  const cloudDream = { id: 'cloud-dream-1', title: 'Cloud dream' } as any;

  const result = mergePersistedDreams([localDream, cloudDream], [cloudDream], []);

  assert.equal(result.some((dream) => dream.id === localDream.id), true);
  assert.equal(result.some((dream) => dream.id === cloudDream.id), true);
  assert.equal(result.filter((dream) => dream.id === cloudDream.id).length, 1);
});

test('preserves card atmosphere colors when merging local and cloud dreams', () => {
  const localDream = {
    id: 'dream-atmos-1',
    title: 'Neon Forest',
    cardColor: '#D8D4FF',
    cardBorderColor: '#C0B9FF',
    cardTextColor: '#1A1C23',
  } as any;

  const cloudDream = {
    id: 'dream-atmos-1',
    title: 'Neon Forest',
    cardColor: '#FFE1D6',
    cardBorderColor: '#F7C4B2',
    cardTextColor: '#1A1C23',
  } as any;

  // Cloud dream (e.g. from Supabase) should take precedence and preserve its atmosphere color
  const result = mergePersistedDreams([localDream], [cloudDream], []);
  const merged = result.find((d) => d.id === 'dream-atmos-1');

  assert.ok(merged);
  assert.equal(merged.cardColor, '#FFE1D6');
  assert.equal(merged.cardBorderColor, '#F7C4B2');
  assert.equal(merged.cardTextColor, '#1A1C23');
});

