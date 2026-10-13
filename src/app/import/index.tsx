import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  dismissFailedImports,
  dismissImportJob,
  importJobs,
  retryImportJob,
  useImportProgress,
} from '@/closet/importActions';
import { useItemCount } from '@/closet/useItems';
import { importDiagnostic } from '@/closet/importDiagnostics';
import { imageStore } from '@/storage/imageStore';
import { AppText, Button, Screen } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

/** Progress of the bulk import, with retry for photos that failed. */
export default function ImportScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { progress, version } = useImportProgress();
  const { data: reviewCount = 0 } = useItemCount({ needsReview: true });
  // Re-read the job list whenever the processor reports a change.
  const { data: jobs = [] } = useQuery({
    queryKey: ['import-jobs', version],
    queryFn: () => importJobs.list(),
  });

  const failed = jobs.filter((job) => job.status === 'failed');
  const active = progress.queued + progress.processing > 0;
  const busy = useRef(false);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState(false);
  const act = async (work: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setActing(true);
    setActionError(false);
    try {
      await work();
    } catch {
      setActionError(true);
    } finally {
      busy.current = false;
      setActing(false);
    }
  };

  return (
    <Screen scroll edges={[]} style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      {progress.total === 0 ? (
        <AppText testID="import-nothing" muted>
          {t('importFlow.nothing')}
        </AppText>
      ) : (
        <>
          <AppText variant="heading" testID="import-summary">
            {t('importFlow.summary', {
              done: progress.done,
              processing: progress.processing,
              queued: progress.queued,
            })}
          </AppText>
          <AppText muted>{active ? t('importFlow.keepOpen') : t('importFlow.allDone')}</AppText>
        </>
      )}

      {failed.length > 0 ? (
        <View testID="import-failed" style={{ gap: spacing.sm }}>
          <AppText variant="label" style={{ color: colors.danger }}>
            {t('importFlow.failedTitle')} ({failed.length})
          </AppText>
          {failed.map((job, index) => {
            const diagnostic = importDiagnostic(job.error);
            return (
              <View
                key={job.id}
                testID={`import-photo-${job.id}`}
                style={{
                  gap: spacing.sm,
                  padding: spacing.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                {job.sourcePath ? (
                  <Image
                    testID={`import-preview-${job.id}`}
                    source={{ uri: imageStore.uri(job.sourcePath) }}
                    contentFit="contain"
                    accessibilityLabel={t('importFlow.photo', { number: index + 1 })}
                    style={{ height: 150, backgroundColor: colors.surface }}
                  />
                ) : null}
                <AppText variant="label">{t('importFlow.photo', { number: index + 1 })}</AppText>
                <AppText testID={`import-reason-${job.id}`} muted>
                  {t(`importFlow.reasons.${diagnostic.reason}`)}
                </AppText>
                {diagnostic.duplicateItemId ? (
                  <Button
                    testID={`import-existing-${job.id}`}
                    kind="secondary"
                    label={t('importFlow.viewExisting')}
                    disabled={acting}
                    onPress={() =>
                      router.push({
                        pathname: '/item/[id]',
                        params: { id: diagnostic.duplicateItemId! },
                      })
                    }
                  />
                ) : null}
                <Button
                  testID={`import-retry-${index}`}
                  icon="refresh-outline"
                  disabled={acting || diagnostic.reason === 'copyPhoto'}
                  label={t(
                    diagnostic.reason === 'duplicate'
                      ? 'importFlow.checkAgain'
                      : 'importFlow.retry',
                  )}
                  onPress={() => void act(() => retryImportJob(job.id))}
                />
                {diagnostic.reason === 'copyPhoto' ? (
                  <Button
                    kind="secondary"
                    label={t('addItem.choosePhoto')}
                    disabled={acting}
                    onPress={() =>
                      router.push({ pathname: '/item/new', params: { source: 'library' } })
                    }
                  />
                ) : null}
                <Button
                  testID={`import-discard-${job.id}`}
                  kind="secondary"
                  disabled={acting}
                  label={t('importFlow.discardPhoto')}
                  onPress={() => void act(() => dismissImportJob(job.id))}
                />
              </View>
            );
          })}
          {failed.length > 1 ? (
            <Button
              testID="import-retry-all"
              icon="refresh-outline"
              label={t('importFlow.retryAll')}
              disabled={acting}
              onPress={() =>
                void act(async () => {
                  for (const job of failed) {
                    if (importDiagnostic(job.error).reason !== 'copyPhoto')
                      await retryImportJob(job.id);
                  }
                })
              }
            />
          ) : null}
          <Button
            testID="import-dismiss-failed"
            kind="secondary"
            label={t('importFlow.discard')}
            disabled={acting}
            onPress={() => void act(dismissFailedImports)}
          />
        </View>
      ) : null}
      {actionError ? (
        <AppText testID="import-action-error" style={{ color: colors.danger }}>
          {t('common.somethingWentWrong')}
        </AppText>
      ) : null}

      {reviewCount > 0 ? (
        <Button
          testID="import-review"
          label={`${t('closet.review')} (${reviewCount})`}
          onPress={() => router.push('/import/review')}
        />
      ) : null}
    </Screen>
  );
}
