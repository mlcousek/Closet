import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AiUnavailableError, type AiUnavailableReason } from '@/ai/client';
import { KeyNeededPrompt } from '@/ai/KeyNeededPrompt';
import { useKeyInfo } from '@/ai/useKeyInfo';
import { Chips } from '@/closet/Chips';
import type { Item } from '@/closet/types';
import { useItem, useItems } from '@/closet/useItems';
import { AppText, Button, Field, Screen } from '@/components/ui';
import { formatTemperature } from '@/i18n/format';
import { OutfitCollage } from '@/outfits/OutfitImage';
import { usageLog } from '@/outfits/renders';
import { outfitRepository } from '@/outfits/repository';
import { useInvalidateOutfits, useOutfits } from '@/outfits/useOutfits';
import { calendarRepository } from '@/planning/calendar';
import { addDays, fromDay, today, type Day } from '@/planning/dates';
import { getChosenCity, getTemperatureUnit } from '@/planning/settings';
import { dayProfile } from '@/planning/suggestions';
import { useInvalidatePlanning, useWeather, weatherFor } from '@/planning/usePlanning';
import { useToday } from '@/planning/useToday';
import { useProfile } from '@/profile/useProfile';
import { deleteWithUndo, useToast } from '@/shell/toast';
import {
  isDisclosed,
  sessionRepository,
  setDisclosed,
  type StylistSession,
} from '@/stylist/sessions';
import { proposeOutfits, type Proposal } from '@/stylist/stylist';
import { useTheme } from '@/theme/useTheme';

const SESSIONS = ['stylist', 'sessions'] as const;
const PROMPTS = ['work', 'dinner', 'weekend', 'unworn'] as const;

/** One proposed outfit with its picture, the stylist's reasoning and what can be done with it. */
function ProposalCard({
  id,
  proposal,
  items,
  day,
  onMark,
}: {
  id: string;
  proposal: Proposal;
  items: Map<string, Item>;
  day: Day | null;
  /** Stores that the proposal was saved or planned, so it stays so when the session is reopened. */
  onMark: (patch: Pick<Proposal, 'outfitId' | 'planned'>) => Promise<void>;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const invalidateOutfits = useInvalidateOutfits();
  const invalidatePlanning = useInvalidatePlanning();
  const showToast = useToast((state) => state.show);
  const [savedId, setSavedId] = useState<string | null>(proposal.outfitId ?? null);
  // An outfit saved from here and deleted since can be saved again.
  const { data: outfits = [] } = useOutfits({});
  const [savedNow, setSavedNow] = useState(false);
  const saved = savedId !== null && (savedNow || outfits.some((outfit) => outfit.id === savedId));
  const [planned, setPlanned] = useState(proposal.planned ?? false);
  // One action at a time: a second tap while saving would create the outfit twice.
  const [working, setWorking] = useState(false);

  const pieces = proposal.pieces.filter((piece) => items.has(piece.itemId));
  const shown = pieces.map((piece) => items.get(piece.itemId)!);
  // A piece deleted since the proposal was made leaves an outfit nobody proposed.
  const complete = pieces.length === proposal.pieces.length;
  const wearable = shown.every((item) => item.ownership === 'owned');

  const save = async (): Promise<string> => {
    // The outfit saved earlier may have been deleted since; then it is saved afresh.
    if (savedId && (await outfitRepository.get(savedId))) return savedId;
    const outfit = await outfitRepository.create(pieces);
    setSavedId(outfit.id);
    setSavedNow(true);
    await onMark({ outfitId: outfit.id });
    await invalidateOutfits();
    return outfit.id;
  };

  const run = async (action: () => Promise<void>) => {
    if (working) return;
    setWorking(true);
    try {
      await action();
    } catch {
      showToast({ message: t('common.somethingWentWrong') });
    } finally {
      setWorking(false);
    }
  };

  return (
    <View
      testID={`proposal-${id}`}
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: spacing.md,
        gap: spacing.md,
      }}
    >
      <View style={{ height: 220 }}>
        <OutfitCollage items={shown} testID={`proposal-collage-${id}`} />
      </View>
      <AppText>{proposal.rationale}</AppText>
      {!wearable ? (
        <AppText testID={`proposal-wishlist-${id}`} variant="caption" muted>
          {t('stylist.wishlistPiece')}
        </AppText>
      ) : null}
      {complete ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <Button
            testID={`proposal-save-${id}`}
            kind="secondary"
            icon={saved ? 'checkmark' : 'bookmark-outline'}
            label={t(saved ? 'stylist.saved' : 'common.save')}
            disabled={saved || working}
            onPress={() =>
              void run(async () => {
                await save();
                showToast({ message: t('stylist.savedToast') });
              })
            }
          />
          <Button
            testID={`proposal-edit-${id}`}
            kind="secondary"
            icon="create-outline"
            label={t('stylist.openInEditor')}
            onPress={() =>
              router.push({
                pathname: '/outfit/edit',
                params: { itemIds: pieces.map((piece) => piece.itemId).join(',') },
              })
            }
          />
          {wearable ? (
            <Button
              testID={`proposal-plan-${id}`}
              kind="secondary"
              icon="calendar-outline"
              label={t(planned ? 'planning.planned' : 'stylist.plan')}
              disabled={planned || working}
              onPress={() =>
                void run(async () => {
                  const outfitId = await save();
                  // A session reopened later may be for a day that has passed.
                  await calendarRepository.plan(day && day >= today() ? day : today(), outfitId);
                  setPlanned(true);
                  await onMark({ planned: true });
                  await invalidatePlanning();
                  showToast({ message: t('stylist.plannedToast') });
                })
              }
            />
          ) : null}
        </View>
      ) : (
        <AppText testID={`proposal-incomplete-${id}`} variant="caption" muted>
          {t('stylist.incomplete')}
        </AppText>
      )}
    </View>
  );
}

/** Ask for outfits in your own words; the stylist answers with combinations of your own clothes. */
export default function StylistScreen() {
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ sessionId?: string; itemId?: string }>();
  const { colors, spacing } = useTheme();
  const client = useQueryClient();
  const { data: keyInfo } = useKeyInfo('anthropic');
  const { data: owned = [] } = useItems({});
  const { data: profile } = useProfile();
  const { data: weather } = useWeather();
  const { data: sessions = [] } = useQuery({
    queryKey: SESSIONS,
    queryFn: () => sessionRepository.list(),
  });

  const [activeId, setActiveId] = useState<string | null>(params.sessionId ?? null);
  const [styleItemId, setStyleItemId] = useState<string | null>(params.itemId ?? null);
  const [text, setText] = useState('');
  // Kept current: a screen left open over midnight must not offer yesterday.
  const currentDay = useToday();
  const [pickedDay, setDay] = useState<Day | null>(null);
  // A day picked before midnight that has since passed counts as no day picked.
  const day = pickedDay && pickedDay >= currentDay ? pickedDay : null;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<AiUnavailableReason | 'noneValid' | null>(null);
  const [disclosed, setDisclosedState] = useState(isDisclosed);

  const active: StylistSession | null = sessions.find((session) => session.id === activeId) ?? null;
  const requiredId = active ? active.itemId : styleItemId;
  const { data: required } = useItem(requiredId ?? undefined);
  const targetDay = active ? active.day : day;

  const items = new Map(owned.map((item) => [item.id, item]));
  if (required) items.set(required.id, required);

  const refresh = () => client.invalidateQueries({ queryKey: SESSIONS });

  const ask = async () => {
    const request = text.trim() || (required && !active ? t('stylist.styleThisRequest') : '');
    if (!request || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const forecast = targetDay ? weatherFor(weather, targetDay) : null;
      const locale = i18n.language;
      const unit = getTemperatureUnit();
      const southern = (weather?.weather?.place.latitude ?? getChosenCity()?.latitude ?? 1) < 0;
      const closet = [...items.values()];
      const proposals = await proposeOutfits({
        request,
        history: active?.turns,
        items: closet,
        language: i18n.language === 'cs' ? 'cs' : 'en',
        hints: { gender: profile?.gender ?? null, bodyType: profile?.bodyType ?? null },
        weather: forecast
          ? `${formatTemperature(forecast.feelsMin, unit, locale)} to ${formatTemperature(forecast.feelsMax, unit, locale)} (feels like), ${forecast.precipitationChance}% chance of rain`
          : null,
        profile: targetDay ? dayProfile(targetDay, forecast, southern) : null,
        mustInclude: required?.id ?? null,
        wearCounts: await calendarRepository.wearCounts(closet.map((item) => item.id)),
        // The provider answered, so the request was paid for even when nothing usable came back.
        onAnswered: () => usageLog.record('stylist'),
      });
      if (proposals.length === 0) {
        setProblem('noneValid');
        return;
      }
      if (active) {
        await sessionRepository.addTurn(active.id, { request, proposals });
      } else {
        const session = await sessionRepository.start({
          request,
          day,
          itemId: required?.id ?? null,
          proposals,
        });
        setActiveId(session.id);
      }
      setText('');
      await refresh();
    } catch (error) {
      setProblem(error instanceof AiUnavailableError ? error.reason : 'error');
    } finally {
      setBusy(false);
    }
  };

  const startOver = () => {
    setActiveId(null);
    setStyleItemId(null);
    setText('');
    setProblem(null);
  };

  const removeSession = (session: StylistSession) =>
    void deleteWithUndo({
      remove: () => sessionRepository.remove(session.id),
      restore: () => sessionRepository.restore(session.id),
      message: t('stylist.sessionDeleted'),
      undoLabel: t('common.undo'),
      onChange: () => void refresh(),
    });

  const dayLabel = (value: Day) =>
    value === currentDay
      ? t('stylist.today')
      : new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric' }).format(
          fromDay(value),
        );

  if (keyInfo && !keyInfo.hasKey) {
    return (
      <Screen edges={[]} style={{ paddingTop: spacing.lg }}>
        <KeyNeededPrompt provider="anthropic" />
      </Screen>
    );
  }

  if (!disclosed) {
    return (
      <Screen edges={[]} style={{ paddingTop: spacing.lg, gap: spacing.lg }}>
        <AppText variant="heading">{t('stylist.disclosureTitle')}</AppText>
        <AppText testID="stylist-disclosure">{t('stylist.disclosure')}</AppText>
        <Button
          testID="stylist-disclosure-accept"
          label={t('stylist.disclosureAccept')}
          onPress={() => {
            setDisclosed();
            setDisclosedState(true);
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={[]} scroll style={{ paddingTop: spacing.lg, gap: spacing.lg }}>
      {active ? (
        <>
          <Button
            testID="stylist-new"
            kind="secondary"
            icon="add"
            label={t('stylist.newRequest')}
            onPress={startOver}
          />
          {active.day ? (
            <AppText testID="stylist-session-day" muted>
              {t('stylist.forDay', { day: dayLabel(active.day) })}
            </AppText>
          ) : null}
          {active.turns.map((turn, turnIndex) => (
            <View key={turnIndex} style={{ gap: spacing.md }}>
              <AppText variant="heading" testID={`stylist-turn-${turnIndex}`}>
                {turn.request}
              </AppText>
              {turn.proposals.map((proposal, index) => (
                <ProposalCard
                  key={index}
                  id={`${turnIndex}-${index}`}
                  proposal={proposal}
                  items={items}
                  day={active.day}
                  onMark={async (patch) => {
                    await sessionRepository.markProposal(active.id, turnIndex, index, patch);
                    await refresh();
                  }}
                />
              ))}
            </View>
          ))}
        </>
      ) : (
        <>
          {required ? (
            <AppText testID="stylist-required" muted>
              {t('stylist.styling', {
                name: required.name ?? t(`taxonomy.category.${required.category}`),
              })}
            </AppText>
          ) : null}
          <View style={{ gap: spacing.sm }}>
            <AppText variant="label" muted>
              {t('stylist.whenLabel')}
            </AppText>
            <Chips
              testIDPrefix="stylist-day"
              scroll
              options={[
                { value: '', label: t('stylist.anyDay') },
                ...Array.from({ length: 7 }, (_, index) => {
                  const value = addDays(currentDay, index);
                  return { value, label: dayLabel(value) };
                }),
              ]}
              selected={[day ?? '']}
              onToggle={(value) => setDay(value || null)}
            />
          </View>
          <Chips
            testIDPrefix="stylist-prompt"
            options={PROMPTS.map((prompt) => ({
              value: prompt,
              label: t(`stylist.prompts.${prompt}`),
            }))}
            selected={[]}
            onToggle={(prompt) => setText(t(`stylist.prompts.${prompt}`))}
          />
        </>
      )}

      <View style={{ gap: spacing.sm }}>
        <Field
          testID="stylist-request"
          value={text}
          onChangeText={setText}
          placeholder={t(active ? 'stylist.refinePlaceholder' : 'stylist.requestPlaceholder')}
        />
        <Button
          testID="stylist-ask"
          icon="sparkles-outline"
          label={t(active ? 'stylist.refine' : 'stylist.ask')}
          loading={busy}
          disabled={!text.trim() && !(required && !active)}
          onPress={() => void ask()}
        />
        {problem ? (
          <AppText testID="stylist-problem" style={{ color: colors.danger }}>
            {t(problem === 'noneValid' ? 'stylist.noneValid' : `stylist.errors.${problem}`)}
          </AppText>
        ) : null}
        <AppText variant="caption" muted>
          {t('stylist.costNote')}
        </AppText>
      </View>

      {!active && sessions.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <AppText variant="label" muted>
            {t('stylist.earlier')}
          </AppText>
          {sessions.map((session) => (
            <View
              key={session.id}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
            >
              <Pressable
                testID={`stylist-session-${session.id}`}
                accessibilityRole="button"
                style={{ flex: 1, paddingVertical: spacing.sm }}
                onPress={() => {
                  setActiveId(session.id);
                  setProblem(null);
                }}
              >
                <AppText numberOfLines={1}>{session.request}</AppText>
                <AppText variant="caption" muted>
                  {new Intl.DateTimeFormat(i18n.language, {
                    day: 'numeric',
                    month: 'long',
                  }).format(new Date(session.createdAt))}
                </AppText>
              </Pressable>
              <Pressable
                testID={`stylist-session-delete-${session.id}`}
                accessibilityRole="button"
                accessibilityLabel={t('common.delete')}
                hitSlop={8}
                onPress={() => removeSession(session)}
              >
                <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
