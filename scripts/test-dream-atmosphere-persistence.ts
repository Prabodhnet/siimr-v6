import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeDream } from '../src/utils/normalizeDream.ts';
import { supabaseService } from '../src/services/supabaseService.ts';
import { deriveCardTheme, getDreamCardStyle, CARD_COLOR_PRESETS } from '../src/utils/cardColors.ts';

test('normalizeDream restores card atmosphere colors from raw_data', () => {
  const dbRecord = {
    id: 'dream-atmos-101',
    user_id: 'user-123',
    title: 'Floating Island Dream',
    content: 'We drifted between jade peaks',
    raw_data: {
      cardColor: '#D8D4FF',
      cardBorderColor: '#C0B9FF',
      cardTextColor: '#1A1C23',
    },
  };

  const dream = normalizeDream(dbRecord);
  assert.equal(dream.cardColor, '#D8D4FF');
  assert.equal(dream.cardBorderColor, '#C0B9FF');
  assert.equal(dream.cardTextColor, '#1A1C23');

  const style = getDreamCardStyle(dream);
  assert.equal(style.cardColor, '#D8D4FF');
  assert.equal(style.cardBorderColor, '#C0B9FF');
  assert.equal(style.cardTextColor, '#1A1C23');
});

test('supabaseService.updateDream updates atmosphere in raw_data and preserves existing fields', async () => {
  let updatedPayload: any = null;
  const mockClient: any = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              id: 'dream-atmos-102',
              title: 'Moonlit Lake',
              raw_data: {
                existingNote: 'Preserve this metadata',
                cardColor: '#D8D4FF',
              },
            },
            error: null,
          }),
        }),
      }),
      update: (payload: any) => ({
        eq: async (col: string, val: string) => {
          updatedPayload = payload;
          return { error: null };
        },
      }),
    }),
  };

  const res = await supabaseService.updateDream(
    'dream-atmos-102',
    {
      cardColor: '#FFE1D6',
      cardBorderColor: '#F7C4B2',
      cardTextColor: '#1A1C23',
    },
    mockClient
  );

  assert.equal(res.success, true);
  assert.ok(updatedPayload);
  assert.equal(updatedPayload.raw_data.cardColor, '#FFE1D6');
  assert.equal(updatedPayload.raw_data.cardBorderColor, '#F7C4B2');
  assert.equal(updatedPayload.raw_data.cardTextColor, '#1A1C23');
  assert.equal(updatedPayload.raw_data.existingNote, 'Preserve this metadata');
});

test('deriveCardTheme correctly matches preset atmospheres and creates valid styles', () => {
  const preset = CARD_COLOR_PRESETS[1]; // e.g. Lucid Peach or Twilight Indigo
  const derived = deriveCardTheme(preset.cardColor);

  assert.equal(derived.cardColor.toLowerCase(), preset.cardColor.toLowerCase());
  assert.ok(derived.cardBorderColor);
  assert.ok(derived.cardTextColor);
});
