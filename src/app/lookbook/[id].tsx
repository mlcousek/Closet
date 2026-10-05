import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button, EmptyState, Field, Screen } from '@/components/ui';
import { lookbookRepository, type Lookbook } from '@/lookbooks/repository';
import { useInvalidateLookbooks, useLookbook } from '@/lookbooks/useLookbooks';
import { OutfitImage } from '@/outfits/OutfitImage';
import type { Outfit } from '@/outfits/repository';
import { useOutfits, useRenderSummary } from '@/outfits/useOutfits';
import { ShareSheet } from '@/sharing/ShareSheet';
import { sheetPages } from '@/sharing/share';
import { deleteWithUndo } from '@/shell/toast';
import { useTheme } from '@/theme/useTheme';

function LookbookView({ lookbook }: { lookbook: Lookbook }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const invalidate = useInvalidateLookbooks();
  const { data: allOutfits = [] } = useOutfits({});
  const summarise = useRenderSummary();
  const [arranging, setArranging] = useState(false);
  const [name, setName] = useState(lookbook.name);
  const [sharePage, setSharePage] = useState<number | null>(null);

  const byId = new Map(allOutfits.map((outfit) => [outfit.id, outfit]));
  const outfits = lookbook.outfitIds
    .map((id) => byId.get(id))
    .filter((outfit): outfit is Outfit => !!outfit);

  const change = async (action: () => Promise<unknown>) => {
    await action();
    await invalidate();
  };

  const remove = () => {
    Alert.alert(t('lookbooks.deleteTitle'), t('lookbooks.deleteMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          router.back();
          void deleteWithUndo({
            remove: () => lookbookRepository.remove(lookbook.id),
            restore: () => lookbookRepository.restore(lookbook.id),
            message: t('lookbooks.deletedToast'),
            undoLabel: t('common.undo'),
            onChange: () => void invalidate(),
          });
        },
      },
    ]);
  };

  const pages = sheetPages(outfits);

  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Field testID="lookbook-name" value={name} onChangeText={setName} />
        </View>
        {name.trim() && name.trim() !== lookbook.name ? (
          <Button
            testID="lookbook-rename"
            kind="secondary"
            label={t('common.save')}
            onPress={() => void change(() => lookbookRepository.rename(lookbook.id, name))}
          />
        ) : null}
      </View>
      {outfits.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              testID="lookbook-arrange"
              kind="secondary"
              label={t(arranging ? 'common.done' : 'lookbooks.arrange')}
              onPress={() => setArranging(!arranging)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              testID="lookbook-share"
              kind="secondary"
              icon="share-outline"
              label={t('share.share')}
              onPress={() => setSharePage(0)}
            />
          </View>
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen edges={[]}>
      <FlatList
        testID="lookbook-grid"
        data={outfits}
        keyExtractor={(outfit) => outfit.id}
        numColumns={2}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState
            icon="albums-outline"
            title={t('lookbooks.emptyTitle')}
            message={t('lookbooks.emptyMessage')}
          />
        }
        ListFooterComponent={
          <View style={{ paddingTop: spacing.lg }}>
            <Button
              testID="lookbook-delete"
              kind="danger"
              label={t('lookbooks.delete')}
              onPress={remove}
            />
          </View>
        }
        columnWrapperStyle={{ gap: spacing.md }}
        contentContainerStyle={{ gap: spacing.md, paddingTop: spacing.lg, paddingBottom: 60 }}
        renderItem={({ item: outfit, index }) => (
          <View style={{ flex: 1 / 2, gap: spacing.xs }}>
            <Pressable
              testID={`lookbook-outfit-${outfit.id}`}
              accessibilityRole="button"
              accessibilityLabel={outfit.name ?? t('outfits.unnamed')}
              onPress={() => router.push({ pathname: '/outfit/[id]', params: { id: outfit.id } })}
            >
              <OutfitImage
                items={outfit.entries.map((entry) => entry.item)}
                summary={summarise(outfit)}
              />
            </Pressable>
            {lookbook.coverOutfitId === outfit.id ? (
              <AppText testID={`lookbook-cover-${outfit.id}`} variant="caption" muted>
                {t('lookbooks.cover')}
              </AppText>
            ) : null}
            {arranging ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Pressable
                  testID={`lookbook-earlier-${outfit.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={t('lookbooks.moveEarlier')}
                  disabled={index === 0}
                  onPress={() =>
                    void change(() =>
                      lookbookRepository.moveOutfit(lookbook.id, outfit.id, index - 1),
                    )
                  }
                >
                  <Ionicons
                    name="arrow-back-circle-outline"
                    size={26}
                    color={index === 0 ? colors.border : colors.text}
                  />
                </Pressable>
                <Pressable
                  testID={`lookbook-set-cover-${outfit.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={t('lookbooks.setCover')}
                  onPress={() =>
                    void change(() => lookbookRepository.setCover(lookbook.id, outfit.id))
                  }
                >
                  <Ionicons name="star-outline" size={24} color={colors.text} />
                </Pressable>
                <Pressable
                  testID={`lookbook-remove-${outfit.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={t('lookbooks.removeOutfit')}
                  onPress={() =>
                    void change(() => lookbookRepository.removeOutfit(lookbook.id, outfit.id))
                  }
                >
                  <Ionicons name="remove-circle-outline" size={26} color={colors.danger} />
                </Pressable>
                <Pressable
                  testID={`lookbook-later-${outfit.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={t('lookbooks.moveLater')}
                  disabled={index === outfits.length - 1}
                  onPress={() =>
                    void change(() =>
                      lookbookRepository.moveOutfit(lookbook.id, outfit.id, index + 1),
                    )
                  }
                >
                  <Ionicons
                    name="arrow-forward-circle-outline"
                    size={26}
                    color={index === outfits.length - 1 ? colors.border : colors.text}
                  />
                </Pressable>
              </View>
            ) : null}
          </View>
        )}
      />

      {sharePage !== null && pages[sharePage] ? (
        <View>
          <ShareSheet
            // Each page of a large lookbook is its own image.
            key={sharePage}
            title={
              pages.length > 1
                ? `${lookbook.name} (${sharePage + 1}/${pages.length})`
                : lookbook.name
            }
            outfits={pages[sharePage].map((outfit) => ({
              id: outfit.id,
              name: outfit.name,
              items: outfit.entries.map((entry) => entry.item),
              renderPath: summarise(outfit).current?.imagePath ?? null,
            }))}
            onClose={() => setSharePage(sharePage + 1 < pages.length ? sharePage + 1 : null)}
          />
        </View>
      ) : null}
    </Screen>
  );
}

export default function LookbookScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: lookbook, isPending } = useLookbook(id);
  if (isPending) return null;
  if (!lookbook) {
    return (
      <Screen edges={[]}>
        <EmptyState
          icon="help-circle-outline"
          title={t('lookbooks.title')}
          message={t('lookbooks.notFound')}
        />
      </Screen>
    );
  }
  // The name field copies the name once, so a renamed lookbook gets a fresh view.
  return <LookbookView key={`${lookbook.id}:${lookbook.name}`} lookbook={lookbook} />;
}
