import { useState } from 'react';
import { FlatList, Modal, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button } from '@/components/ui';
import { formatTemperature } from '@/i18n/format';
import { OutfitCollage, OutfitImage } from '@/outfits/OutfitImage';
import { isAutoRenderOn } from '@/outfits/renderActions';
import { outfitRepository, type Outfit } from '@/outfits/repository';
import { useInvalidateOutfits, useOutfits, useRenderSummary } from '@/outfits/useOutfits';
import { useRenderRequest } from '@/outfits/useRenderRequest';
import { deleteWithUndo, useToast } from '@/shell/toast';
import { useTheme } from '@/theme/useTheme';

import { FutureWearError, calendarRepository, type CalendarEntry } from './calendar';
import { addDays, fromDay, today, type Day } from './dates';
import { getTemperatureUnit } from './settings';
import { isWearable, type Suggestion } from './suggestions';
import { useInvalidatePlanning, useSuggestions } from './usePlanning';

/** A sheet for choosing one of the saved outfits that can be worn. */
function OutfitPicker({
  onPick,
  onClose,
}: {
  onPick: (outfit: Outfit) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const { data: outfits = [] } = useOutfits({});
  const summarise = useRenderSummary();
  const wearable = outfits.filter(isWearable);
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View
        testID="outfit-picker"
        style={{
          flex: 1,
          backgroundColor: colors.background,
          paddingTop: insets.top + spacing.lg,
          paddingHorizontal: spacing.lg,
          gap: spacing.md,
        }}
      >
        <AppText variant="heading">{t('planning.chooseOutfit')}</AppText>
        <FlatList
          data={wearable}
          keyExtractor={(outfit) => outfit.id}
          numColumns={3}
          columnWrapperStyle={{ gap: spacing.sm }}
          contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xl }}
          ListEmptyComponent={<AppText muted>{t('planning.noOutfits')}</AppText>}
          renderItem={({ item: outfit }) => (
            <Pressable
              testID={`pick-outfit-${outfit.id}`}
              accessibilityRole="button"
              accessibilityLabel={outfit.name ?? t('outfits.unnamed')}
              onPress={() => onPick(outfit)}
              style={{ flex: 1 / 3 }}
            >
              <OutfitImage
                items={outfit.entries.map((entry) => entry.item)}
                summary={summarise(outfit)}
              />
            </Pressable>
          )}
        />
        <View style={{ paddingBottom: insets.bottom + spacing.md }}>
          <Button
            testID="outfit-picker-close"
            kind="secondary"
            label={t('common.cancel')}
            onPress={onClose}
          />
        </View>
      </View>
    </Modal>
  );
}

/** A sheet for choosing one of the coming days, to move a plan to. */
function DayPicker({
  from,
  onPick,
  onClose,
}: {
  from: Day;
  onPick: (day: Day) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const days = Array.from({ length: 14 }, (_, index) => addDays(today(), index)).filter(
    (day) => day !== from,
  );
  const label = (day: Day) =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(fromDay(day));
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={onClose} />
      <View
        testID="day-picker"
        style={{
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          padding: spacing.lg,
          paddingBottom: spacing.xxl,
          gap: spacing.md,
        }}
      >
        <AppText variant="heading">{t('planning.moveTo')}</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {days.map((day) => (
            <Pressable
              key={day}
              testID={`pick-day-${day}`}
              accessibilityRole="button"
              onPress={() => onPick(day)}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radius.pill,
                backgroundColor: colors.surfaceAlt,
              }}
            >
              <AppText variant="label">{label(day)}</AppText>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

type Picking = { purpose: 'add' } | { purpose: 'replace'; entryId: string } | null;

/**
 * Everything about one day: its outfits (worn or planned) with their actions,
 * or, when there are none, a suggestion for today and coming days and a way
 * to log what was worn on past days.
 */
export function DayPanel({
  day,
  entries,
  outfitsById,
  temperature,
}: {
  day: Day;
  entries: CalendarEntry[];
  outfitsById: Map<string, Outfit>;
  /** Daytime apparent temperature in Celsius for the day, when known. */
  temperature?: number | null;
}) {
  const { t, i18n } = useTranslation();
  const { spacing } = useTheme();
  const invalidatePlanning = useInvalidatePlanning();
  const invalidateOutfits = useInvalidateOutfits();
  const requestRender = useRenderRequest();
  const summarise = useRenderSummary();
  const showToast = useToast((state) => state.show);
  const { profile, suggestions, ready } = useSuggestions(day);
  const [skipped, setSkipped] = useState(0);
  const [picking, setPicking] = useState<Picking>(null);
  const [moving, setMoving] = useState<string | null>(null);

  const isFuture = day > today();
  const isPast = day < today();
  const shown = entries.filter((entry) => outfitsById.has(entry.outfitId));
  // Entries whose outfit has since been deleted still count in the log, so they stay removable.
  const orphaned = entries.filter((entry) => !outfitsById.has(entry.outfitId));
  const [busy, setBusy] = useState(false);
  const suggestion: Suggestion | undefined =
    suggestions.length > 0 ? suggestions[skipped % suggestions.length] : undefined;

  const done = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      // A future day cannot be worn; anything else is reported, never left unhandled.
      if (!(error instanceof FutureWearError))
        showToast({ message: t('common.somethingWentWrong') });
    } finally {
      setBusy(false);
      await invalidatePlanning();
    }
  };

  /** Puts an outfit on the day: worn for past days, planned otherwise unless asked to mark it worn. */
  const place = (outfitId: string, worn: boolean) =>
    done(() =>
      worn ? calendarRepository.logWorn(day, outfitId) : calendarRepository.plan(day, outfitId),
    );

  const accept = (chosen: Suggestion, worn: boolean) =>
    done(async () => {
      let outfit = chosen.outfit;
      if (!outfit) {
        // A new combination becomes a saved outfit first.
        outfit = await outfitRepository.create(chosen.pieces);
        await invalidateOutfits();
        if (isAutoRenderOn()) void requestRender(outfit, false, true).catch(() => {});
      }
      await (worn
        ? calendarRepository.logWorn(day, outfit.id)
        : calendarRepository.plan(day, outfit.id));
    });

  const remove = (entry: CalendarEntry) =>
    deleteWithUndo({
      remove: () => calendarRepository.remove(entry.id),
      restore: () => calendarRepository.restore(entry.id),
      message: t('planning.removedToast'),
      undoLabel: t('common.undo'),
      onChange: () => void invalidatePlanning(),
    });

  const locale = i18n.language === 'cs' ? 'cs-CZ' : 'en-GB';

  return (
    <View testID={`day-panel-${day}`} style={{ gap: spacing.lg }}>
      {temperature != null ? (
        <AppText testID="day-temperature" muted>
          {formatTemperature(temperature, getTemperatureUnit(), locale)}
        </AppText>
      ) : null}

      {shown.map((entry, index) => {
        const outfit = outfitsById.get(entry.outfitId)!;
        const unconfirmed = entry.state === 'planned' && isPast;
        return (
          <View key={entry.id} testID={`day-entry-${entry.id}`} style={{ gap: spacing.sm }}>
            <View style={{ width: index === 0 ? '60%' : '35%', alignSelf: 'center' }}>
              <OutfitImage
                large={index === 0}
                items={outfit.entries.map((piece) => piece.item)}
                summary={summarise(outfit)}
              />
            </View>
            <AppText
              testID={`day-entry-state-${entry.id}`}
              variant="label"
              style={{ textAlign: 'center' }}
            >
              {t(
                entry.state === 'worn'
                  ? 'planning.worn'
                  : unconfirmed
                    ? 'planning.notConfirmed'
                    : 'planning.planned',
              )}
            </AppText>
            {entry.state === 'planned' && !isFuture ? (
              <Button
                testID={`day-mark-worn-${entry.id}`}
                icon="checkmark"
                label={t('planning.markWorn')}
                onPress={() => void done(() => calendarRepository.markWorn(entry.id))}
              />
            ) : null}
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  testID={`day-replace-${entry.id}`}
                  kind="secondary"
                  label={t('planning.replace')}
                  onPress={() => setPicking({ purpose: 'replace', entryId: entry.id })}
                />
              </View>
              {entry.state === 'planned' ? (
                <View style={{ flex: 1 }}>
                  <Button
                    testID={`day-move-${entry.id}`}
                    kind="secondary"
                    label={t('planning.move')}
                    onPress={() => setMoving(entry.id)}
                  />
                </View>
              ) : null}
              <View style={{ flex: 1 }}>
                <Button
                  testID={`day-remove-${entry.id}`}
                  kind="secondary"
                  label={t('common.remove')}
                  onPress={() => void remove(entry)}
                />
              </View>
            </View>
          </View>
        );
      })}

      {orphaned.map((entry) => (
        <View key={entry.id} testID={`day-orphan-${entry.id}`} style={{ gap: spacing.sm }}>
          <AppText muted style={{ textAlign: 'center' }}>
            {t('planning.deletedOutfit')}
          </AppText>
          <Button
            testID={`day-remove-${entry.id}`}
            kind="secondary"
            label={t('common.remove')}
            onPress={() => void remove(entry)}
          />
        </View>
      ))}

      {shown.length === 0 && !isPast && ready && suggestion ? (
        <View testID="day-suggestion" style={{ gap: spacing.sm }}>
          <View style={{ width: '60%', aspectRatio: 3 / 4, alignSelf: 'center' }}>
            {suggestion.outfit ? (
              <OutfitImage large items={suggestion.items} summary={summarise(suggestion.outfit)} />
            ) : (
              <OutfitCollage items={suggestion.items} testID="suggestion-collage" />
            )}
          </View>
          <AppText testID="suggestion-reason" muted style={{ textAlign: 'center' }}>
            {t(`planning.reason.${suggestion.reason}`, {
              temperature:
                profile.temperature != null
                  ? formatTemperature(profile.temperature, getTemperatureUnit(), locale)
                  : '',
            })}
            {suggestion.outfit ? '' : ` · ${t('planning.newCombination')}`}
          </AppText>
          <Button
            testID="suggestion-accept"
            label={t(isFuture ? 'planning.planThis' : 'planning.wearThis')}
            onPress={() => void accept(suggestion, false)}
          />
          {suggestions.length > 1 ? (
            <Button
              testID="suggestion-another"
              kind="secondary"
              icon="refresh"
              label={t('planning.showAnother')}
              onPress={() => setSkipped(skipped + 1)}
            />
          ) : null}
        </View>
      ) : null}

      {shown.length === 0 && isPast ? (
        <AppText testID="day-empty" muted style={{ textAlign: 'center' }}>
          {t('planning.nothingLogged')}
        </AppText>
      ) : null}

      <Button
        testID="day-add"
        kind="secondary"
        icon="add"
        label={t(
          shown.length > 0
            ? 'planning.addAnother'
            : isPast
              ? 'planning.logWorn'
              : 'planning.chooseOutfit',
        )}
        onPress={() => setPicking({ purpose: 'add' })}
      />

      {picking ? (
        <OutfitPicker
          onClose={() => setPicking(null)}
          onPick={(outfit) => {
            const current = picking;
            setPicking(null);
            if (current.purpose === 'replace') {
              void done(() => calendarRepository.replaceOutfit(current.entryId, outfit.id));
            } else void place(outfit.id, isPast);
          }}
        />
      ) : null}
      {moving ? (
        <DayPicker
          from={day}
          onClose={() => setMoving(null)}
          onPick={(target) => {
            const entryId = moving;
            setMoving(null);
            void done(() => calendarRepository.move(entryId, target));
          }}
        />
      ) : null}
    </View>
  );
}
