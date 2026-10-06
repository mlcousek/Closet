import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { extensionOf } from '@/closet/itemImages';
import { usePendingLink } from '@/closet/pendingLink';
import {
  LinkImportError,
  fetchProductPage,
  parseWebUrl,
  type LinkImportReason,
  type ProductInfo,
} from '@/closet/productPage';
import { AppText, Button, Field, Screen } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

type Product = ProductInfo & { url: string };

/** Downloads a remote image to a temporary file and returns its URI. */
async function download(url: string): Promise<string> {
  const target = `${FileSystem.cacheDirectory}link-import-${Date.now()}.${extensionOf(url)}`;
  const result = await FileSystem.downloadAsync(url, target);
  if (result.status < 200 || result.status >= 300) throw new Error('download failed');
  return result.uri;
}

/** Adds an item from a shop link: fetch the page, choose a photo, continue to the item form. */
export default function LinkImportScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { target } = useLocalSearchParams<{ target?: string }>();
  const { colors, spacing, radius } = useTheme();
  const [link, setLink] = useState('');
  const [clipboardLink, setClipboardLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LinkImportReason | 'download' | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // hasUrlAsync does not read the clipboard, so it shows no paste prompt.
        if (!(await Clipboard.hasUrlAsync())) return;
        const url = parseWebUrl((await Clipboard.getUrlAsync()) ?? '');
        if (url && !cancelled) setClipboardLink(url);
      } catch {
        // The clipboard offer is a convenience; without it the user pastes by hand.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = async (value: string) => {
    setBusy(true);
    setError(null);
    setProduct(null);
    try {
      const found = await fetchProductPage(value);
      setProduct(found);
      setChosen(found.images[0] ?? null);
    } catch (failure) {
      setError(failure instanceof LinkImportError ? failure.reason : 'unreachable');
    } finally {
      setBusy(false);
    }
  };

  const proceed = async () => {
    if (!product || !chosen) return;
    setBusy(true);
    setError(null);
    try {
      const uri = await download(chosen);
      usePendingLink.getState().set({
        uri,
        sourceUrl: product.url,
        name: product.name,
        brand: product.brand,
        price: product.price,
        currency: product.currency,
        target: target === 'wishlist' ? 'wishlist' : 'owned',
      });
      router.replace({ pathname: '/item/new', params: { source: 'link' } });
    } catch {
      setError('download');
      setBusy(false);
    }
  };

  return (
    <Screen scroll edges={[]} style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <Field
        testID="link-input"
        value={link}
        onChangeText={setLink}
        placeholder={t('linkImport.placeholder')}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {clipboardLink && clipboardLink !== link ? (
        <Button
          testID="link-use-clipboard"
          kind="secondary"
          icon="clipboard-outline"
          label={t('linkImport.useClipboard')}
          onPress={() => {
            setLink(clipboardLink);
            void load(clipboardLink);
          }}
        />
      ) : null}
      <Button
        testID="link-fetch"
        label={t('linkImport.fetch')}
        loading={busy && !product}
        disabled={!link.trim()}
        onPress={() => void load(link)}
      />

      {error ? (
        <View
          testID="link-error"
          style={{
            backgroundColor: colors.surfaceAlt,
            borderRadius: radius.md,
            padding: spacing.lg,
            gap: spacing.md,
          }}
        >
          <AppText>{t(`linkImport.errors.${error}`)}</AppText>
          <Button
            testID="link-fallback"
            kind="secondary"
            label={t('linkImport.fallback')}
            onPress={() =>
              router.replace({
                pathname: '/item/new',
                params: { source: 'library', target: target === 'wishlist' ? 'wishlist' : 'owned' },
              })
            }
          />
        </View>
      ) : null}

      {product ? (
        <View testID="link-product" style={{ gap: spacing.md }}>
          <View>
            {product.name ? <AppText variant="heading">{product.name}</AppText> : null}
            <AppText muted>
              {[
                product.brand,
                product.price !== null ? `${product.price} ${product.currency ?? ''}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </AppText>
          </View>
          <AppText muted>{t('linkImport.chooseImage')}</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {product.images.map((url, index) => (
              <Pressable
                key={url}
                testID={`link-image-${index}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: url === chosen }}
                onPress={() => setChosen(url)}
              >
                <Image
                  source={{ uri: url }}
                  contentFit="cover"
                  style={{
                    width: 100,
                    height: 132,
                    borderRadius: radius.sm,
                    backgroundColor: colors.surfaceAlt,
                    borderWidth: url === chosen ? 3 : 0,
                    borderColor: colors.primary,
                  }}
                />
              </Pressable>
            ))}
          </View>
          <Button
            testID="link-continue"
            label={t('linkImport.continue')}
            loading={busy}
            disabled={!chosen}
            onPress={() => void proceed()}
          />
        </View>
      ) : null}
    </Screen>
  );
}
