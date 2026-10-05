import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { IconName } from '@/components/ui';
import { AddButton } from '@/shell/AddMenu';
import { useTheme } from '@/theme/useTheme';

const TABS: { name: string; labelKey: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'index', labelKey: 'tabs.home', icon: 'home-outline', iconActive: 'home' },
  { name: 'closet', labelKey: 'tabs.closet', icon: 'shirt-outline', iconActive: 'shirt' },
  { name: 'outfits', labelKey: 'tabs.outfits', icon: 'albums-outline', iconActive: 'albums' },
  { name: 'calendar', labelKey: 'tabs.calendar', icon: 'calendar-outline', iconActive: 'calendar' },
  { name: 'profile', labelKey: 'tabs.profile', icon: 'person-outline', iconActive: 'person' },
];

export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.text,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        }}
      >
        {TABS.map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: t(tab.labelKey),
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons name={focused ? tab.iconActive : tab.icon} size={size} color={color} />
              ),
            }}
          />
        ))}
      </Tabs>
      <AddButton />
    </>
  );
}
