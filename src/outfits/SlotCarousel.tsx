import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import {
  FlatList,
  Pressable,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import type { Item } from '@/closet/types';
import { imageStore } from '@/storage/imageStore';
import { useTheme } from '@/theme/useTheme';

const CELL = 92;
const GAP = 10;
const STEP = CELL + GAP;

type Cell = { key: string; item: Item | null };

/**
 * One horizontally scrolling row of closet items. The first position means
 * "none". The item that comes to rest in the middle of the row becomes the
 * selection; tapping an item selects it directly.
 */
export function SlotCarousel({
  items,
  selectedId,
  onSelect,
  testID,
}: {
  items: Item[];
  selectedId: string | null;
  onSelect: (itemId: string | null) => void;
  testID: string;
}) {
  const { colors, radius } = useTheme();
  const { width } = useWindowDimensions();
  // Half the row on each side, so the first and last cells can come to rest in the middle.
  const side = Math.max(0, (width - 32 - CELL) / 2);
  const list = useRef<FlatList<Cell>>(null);
  const cells: Cell[] = [
    { key: 'none', item: null },
    ...items.map((item) => ({ key: item.id, item })),
  ];
  const selectedIndex = Math.max(
    0,
    cells.findIndex((cell) => (cell.item?.id ?? null) === selectedId),
  );

  // Keeps the row resting on the selection when it changes from outside, for example on shuffle.
  useEffect(() => {
    list.current?.scrollToOffset({ offset: selectedIndex * STEP, animated: true });
  }, [selectedIndex]);

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.min(
      cells.length - 1,
      Math.max(0, Math.round(event.nativeEvent.contentOffset.x / STEP)),
    );
    const id = cells[index].item?.id ?? null;
    if (id !== selectedId) onSelect(id);
  };

  return (
    <FlatList
      ref={list}
      testID={testID}
      horizontal
      data={cells}
      keyExtractor={(cell) => cell.key}
      showsHorizontalScrollIndicator={false}
      snapToInterval={STEP}
      decelerationRate="fast"
      onMomentumScrollEnd={settle}
      getItemLayout={(_, index) => ({ length: STEP, offset: STEP * index, index })}
      contentContainerStyle={{ gap: GAP, paddingHorizontal: side }}
      initialNumToRender={6}
      windowSize={5}
      renderItem={({ item: cell }) => {
        const selected = (cell.item?.id ?? null) === selectedId;
        return (
          <Pressable
            testID={`${testID}-${cell.item?.id ?? 'none'}`}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={cell.item?.name ?? cell.key}
            onPress={() => onSelect(cell.item?.id ?? null)}
            style={{
              width: CELL,
              height: CELL,
              borderRadius: radius.sm,
              borderWidth: selected ? 2 : 1,
              borderColor: selected ? colors.primary : colors.border,
              backgroundColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {cell.item ? (
              <View style={{ width: '100%', height: '100%' }}>
                <Image
                  source={{ uri: imageStore.uri(cell.item.thumbPath) }}
                  contentFit="contain"
                  recyclingKey={cell.item.id}
                  style={{ flex: 1 }}
                />
                {cell.item.ownership === 'archived' ? (
                  <View style={{ position: 'absolute', right: 4, top: 4 }}>
                    <Ionicons name="archive" size={14} color={colors.textMuted} />
                  </View>
                ) : null}
              </View>
            ) : (
              <Ionicons name="ban-outline" size={26} color={colors.textMuted} />
            )}
          </Pressable>
        );
      }}
    />
  );
}
