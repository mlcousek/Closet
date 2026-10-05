import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

/**
 * The charts are plain views: the app needs bars, one share bar and a column
 * trend, which is less than a charting library costs in build risk for a
 * sideloaded app that cannot be tried on a simulator.
 */

export type Bar = { key: string; label: string; value: number; swatch?: string };

/** Horizontal bars, longest first as given. A bar can be pressed when onPress is set. */
export function Bars({
  bars,
  onPress,
  testIDPrefix,
}: {
  bars: Bar[];
  onPress?: (key: string) => void;
  testIDPrefix: string;
}) {
  const { colors, spacing, radius } = useTheme();
  const max = Math.max(1, ...bars.map((bar) => bar.value));
  return (
    <View style={{ gap: spacing.sm }}>
      {bars.map((bar) => {
        const row = (
          <View style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="label">{bar.label}</AppText>
              <AppText variant="label" muted>
                {bar.value}
              </AppText>
            </View>
            <View
              style={{ height: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt }}
            >
              <View
                style={{
                  width: `${(bar.value / max) * 100}%`,
                  height: 10,
                  borderRadius: radius.pill,
                  backgroundColor: bar.swatch ?? colors.primary,
                  borderWidth: bar.swatch ? 1 : 0,
                  borderColor: colors.border,
                }}
              />
            </View>
          </View>
        );
        return onPress ? (
          <Pressable
            key={bar.key}
            testID={`${testIDPrefix}-${bar.key}`}
            accessibilityRole="button"
            accessibilityLabel={`${bar.label}: ${bar.value}`}
            onPress={() => onPress(bar.key)}
          >
            {row}
          </Pressable>
        ) : (
          <View key={bar.key} testID={`${testIDPrefix}-${bar.key}`}>
            {row}
          </View>
        );
      })}
    </View>
  );
}

/** One bar filled to a share between 0 and 1, standing in for a donut. */
export function ShareBar({ share, testID }: { share: number; testID: string }) {
  const { colors, radius } = useTheme();
  const percent = Math.round(Math.min(1, Math.max(0, share)) * 100);
  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={{ height: 16, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt }}
    >
      <View
        style={{
          width: `${percent}%`,
          height: 16,
          borderRadius: radius.pill,
          backgroundColor: colors.success,
        }}
      />
    </View>
  );
}

/** Columns over time, oldest on the left. */
export function Trend({
  points,
  testID,
}: {
  points: { key: string; label: string; value: number }[];
  testID: string;
}) {
  const { colors, spacing, radius } = useTheme();
  const max = Math.max(1, ...points.map((point) => point.value));
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs }}>
      {points.map((point) => (
        <View
          key={point.key}
          accessibilityLabel={`${point.label}: ${point.value}`}
          style={{ flex: 1, alignItems: 'center', gap: spacing.xs }}
        >
          <View style={{ height: 80, justifyContent: 'flex-end', alignSelf: 'stretch' }}>
            <View
              style={{
                height: Math.max(2, (point.value / max) * 80),
                borderRadius: radius.sm,
                backgroundColor: point.value > 0 ? colors.primary : colors.surfaceAlt,
              }}
            />
          </View>
          <AppText variant="caption" muted numberOfLines={1}>
            {point.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}
