import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ActivityIndicator, StyleSheet, View, type DimensionValue } from 'react-native';

import type { Item } from '@/closet/types';
import { useTheme } from '@/theme/useTheme';
import { imageStore } from '@/storage/imageStore';

import type { RenderSummary } from './renders';

/** Where each piece sits in the flat preview, as shares of the box: a loose figure from head to feet. */
function layout(
  count: number,
  index: number,
): { left: DimensionValue; top: DimensionValue; size: DimensionValue } {
  if (count === 1) return { left: '15%', top: '15%', size: '70%' };
  if (count === 2) return { left: '20%', top: index === 0 ? '2%' : '50%', size: '48%' };
  // Two columns, filled row by row.
  const columns = 2;
  const rows = Math.ceil(count / columns);
  const size = Math.min(48, 96 / rows);
  const column = index % columns;
  const row = Math.floor(index / columns);
  return {
    left: `${column * 50 + (50 - size) / 2}%`,
    top: `${(row * 100) / rows + (100 / rows - size) / 2}%`,
    size: `${size}%`,
  };
}

/** The flat preview: the cutouts of the pieces laid out together. Instant, and works offline. */
export function OutfitCollage({
  items,
  testID = 'outfit-collage',
}: {
  items: Pick<Item, 'id' | 'thumbPath'>[];
  testID?: string;
}) {
  return (
    <View testID={testID} style={styles.fill}>
      {items.map((item, index) => {
        const place = layout(items.length, index);
        return (
          <Image
            key={item.id}
            testID={`collage-piece-${item.id}`}
            source={{ uri: imageStore.uri(item.thumbPath) }}
            contentFit="contain"
            style={{
              position: 'absolute',
              left: place.left,
              top: place.top,
              width: place.size,
              height: place.size,
            }}
          />
        );
      })}
    </View>
  );
}

/**
 * The picture of an outfit: its try-on render when one exists, otherwise the
 * flat preview, with a small mark while a render is in progress, after one
 * failed, or when the shown render is outdated.
 */
export function OutfitImage({
  items,
  summary,
  large,
  renderPath,
  wishlist,
}: {
  items: Pick<Item, 'id' | 'thumbPath'>[];
  summary: RenderSummary;
  large?: boolean;
  /** Overrides which render image is shown, for stepping back to the previous one. */
  renderPath?: string | null;
  /** Marks an outfit that contains a wishlist piece. */
  wishlist?: boolean;
}) {
  const { colors, radius } = useTheme();
  const path =
    renderPath ?? (large ? summary.current?.imagePath : summary.current?.thumbPath) ?? null;
  return (
    <View
      style={[
        styles.box,
        { backgroundColor: colors.surface, borderRadius: radius.md, aspectRatio: 3 / 4 },
      ]}
    >
      {path ? (
        <Image
          testID="outfit-render"
          source={{ uri: imageStore.uri(path) }}
          contentFit="cover"
          style={styles.fill}
        />
      ) : (
        <OutfitCollage items={items} />
      )}
      {wishlist ? (
        <View
          testID="outfit-wishlist"
          style={[styles.badge, styles.wishlist, { backgroundColor: colors.overlay }]}
        >
          <Ionicons name="heart" size={14} color="#FFFFFF" />
        </View>
      ) : null}
      <View style={styles.badges}>
        {summary.pending ? (
          <View testID="render-pending" style={[styles.badge, { backgroundColor: colors.overlay }]}>
            <ActivityIndicator size="small" color="#FFFFFF" />
          </View>
        ) : summary.failed ? (
          <View testID="render-failed" style={[styles.badge, { backgroundColor: colors.danger }]}>
            <Ionicons name="alert" size={14} color="#FFFFFF" />
          </View>
        ) : summary.outdated ? (
          <View
            testID="render-outdated"
            style={[styles.badge, { backgroundColor: colors.overlay }]}
          >
            <Ionicons name="refresh" size={14} color="#FFFFFF" />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  box: { overflow: 'hidden' },
  badges: { position: 'absolute', top: 8, right: 8 },
  wishlist: { position: 'absolute', top: 8, left: 8 },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
