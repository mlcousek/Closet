import { Pressable, ScrollView, View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

export type ChipOption<T extends string | number> = {
  value: T;
  label: string;
  /** Optional colour dot, for colour choices. */
  swatch?: string;
};

type Props<T extends string | number> = {
  options: ChipOption<T>[];
  selected: T[];
  onToggle: (value: T) => void;
  /** Lays the chips out in one scrolling row instead of wrapping. */
  scroll?: boolean;
  testIDPrefix: string;
};

/** A set of toggleable chips. Single- or multi-select is decided by the caller's onToggle. */
export function Chips<T extends string | number>({
  options,
  selected,
  onToggle,
  scroll,
  testIDPrefix,
}: Props<T>) {
  const { colors, spacing, radius } = useTheme();
  const chips = options.map((option) => {
    const active = selected.includes(option.value);
    return (
      <Pressable
        key={String(option.value)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: active }}
        accessibilityLabel={option.label}
        testID={`${testIDPrefix}-${option.value}`}
        onPress={() => onToggle(option.value)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radius.pill,
          backgroundColor: active ? colors.primary : colors.surfaceAlt,
        }}
      >
        {option.swatch ? (
          <View
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: option.swatch,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          />
        ) : null}
        <AppText variant="label" style={{ color: active ? colors.onPrimary : colors.text }}>
          {option.label}
        </AppText>
      </Pressable>
    );
  });

  if (scroll) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm }}
      >
        {chips}
      </ScrollView>
    );
  }
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{chips}</View>;
}

/** Adds or removes a value from a multi-select list. */
export function toggled<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}
