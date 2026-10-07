import { useQueryClient } from '@tanstack/react-query';
import * as Application from 'expo-application';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { TaggingUsage } from '@/ai/TaggingUsage';
import { AppText, Row, Screen } from '@/components/ui';
import { getLanguageOverride, setLanguageOverride } from '@/i18n';
import type { Language } from '@/i18n/language';
import { isImporting, resumeImports } from '@/closet/importActions';
import { DisplaySettings } from '@/display/DisplaySettings';
import { useRenderVersion } from '@/outfits/renderActions';
import { renderRepository } from '@/outfits/renders';
import { PlanningSettings } from '@/planning/PlanningSettings';
import { restoreReminder } from '@/planning/reminder';
import { StylistUsage } from '@/stylist/StylistUsage';
import { useToast } from '@/shell/toast';
import { BackupError } from '@/storage/backup';
import { exportBackup, importBackup, pickBackupFile } from '@/storage/backupActions';
import { useTheme } from '@/theme/useTheme';

const LANGUAGE_OPTIONS: { value: Language | null; labelKey: string }[] = [
  { value: null, labelKey: 'settings.languageSystem' },
  { value: 'en', labelKey: 'settings.languageEn' },
  { value: 'cs', labelKey: 'settings.languageCs' },
];

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors, spacing, radius } = useTheme();
  const showToast = useToast((state) => state.show);
  const [override, setOverride] = useState<Language | null>(getLanguageOverride);
  const [busy, setBusy] = useState(false);
  // Set at once, unlike the state: two taps in one frame must not both start a backup.
  const working = useRef(false);
  // The file picker is open: a second tap must not open another one.
  const picking = useRef(false);

  const chooseLanguage = async (language: Language | null) => {
    setOverride(language);
    await setLanguageOverride(language);
    // The reminder was scheduled with its text; it gets the new language.
    void restoreReminder({ title: i18n.t('reminder.title'), body: i18n.t('reminder.body') });
  };

  const onExport = async () => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await exportBackup();
    } catch {
      showToast({ message: t('backup.exportFailed') });
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  const restore = async (archive: string) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await importBackup(archive);
      // Everything on screen may be stale now, including the language override.
      // Imports in the restored data continue from what it says. Renders that were waiting
      // when the backup was made are not started: each would be a paid request.
      await resumeImports();
      await renderRepository.failUnfinished();
      useRenderVersion.setState((state) => ({ version: state.version + 1 }));
      await queryClient.resetQueries();
      const restoredOverride = getLanguageOverride();
      setOverride(restoredOverride);
      await setLanguageOverride(restoredOverride);
      showToast({ message: i18n.t('backup.importDone') });
    } catch (error) {
      const reason = error instanceof BackupError ? error.reason : null;
      showToast({
        message:
          reason === 'newer'
            ? t('backup.importNewer')
            : reason === 'invalid'
              ? t('backup.importInvalid')
              : reason === 'unwritable'
                ? t('backup.importNoSpace')
                : t('common.somethingWentWrong'),
      });
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  const onImport = async () => {
    if (working.current || picking.current) return;
    // Photos still being imported would be written into the restored closet.
    if (isImporting()) {
      showToast({ message: t('backup.importWhileImporting') });
      return;
    }
    let archive: string | null;
    picking.current = true;
    try {
      archive = await pickBackupFile();
    } catch {
      showToast({ message: t('backup.importInvalid') });
      return;
    } finally {
      picking.current = false;
    }
    if (!archive) return;
    const picked = archive;
    Alert.alert(t('backup.importConfirmTitle'), t('backup.importConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('backup.importConfirmAction'),
        style: 'destructive',
        onPress: () => void restore(picked),
      },
    ]);
  };

  const version = Application.nativeApplicationVersion ?? '–';
  const build = Application.nativeBuildVersion ?? '–';

  return (
    <Screen scroll edges={[]}>
      <AppText variant="label" muted style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
        {t('settings.language')}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {LANGUAGE_OPTIONS.map((option) => {
          const selected = option.value === override;
          return (
            <Pressable
              key={option.labelKey}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              testID={`language-${option.value ?? 'system'}`}
              disabled={busy}
              onPress={() => void chooseLanguage(option.value)}
              style={{
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm,
                borderRadius: radius.pill,
                backgroundColor: selected ? colors.primary : colors.surfaceAlt,
              }}
            >
              <AppText variant="label" style={{ color: selected ? colors.onPrimary : colors.text }}>
                {t(option.labelKey)}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View style={{ marginTop: spacing.xl }}>
        <Row
          testID="open-ai-keys"
          icon="key-outline"
          label={t('settings.aiKeys')}
          onPress={() => router.push('/settings/ai-keys')}
        />
        <StylistUsage />
        <TaggingUsage />
      </View>

      <View style={{ marginTop: spacing.xl }}>
        <PlanningSettings />
      </View>

      <View style={{ marginTop: spacing.xl }}>
        <DisplaySettings />
      </View>

      <AppText variant="label" muted style={{ marginTop: spacing.xl }}>
        {t('settings.backup')}
      </AppText>
      {busy ? (
        <AppText testID="backup-working" muted>
          {t('backup.working')}
        </AppText>
      ) : null}
      <Row
        testID="export-backup"
        icon="share-outline"
        label={t('settings.exportBackup')}
        onPress={() => void onExport()}
      />
      <Row
        testID="import-backup"
        icon="download-outline"
        label={t('settings.importBackup')}
        onPress={() => void onImport()}
      />

      <View style={{ marginTop: spacing.xl }}>
        <Row
          testID="version-row"
          label={t('settings.version')}
          value={`${version} · ${t('settings.build', { build })}`}
        />
      </View>
    </Screen>
  );
}
