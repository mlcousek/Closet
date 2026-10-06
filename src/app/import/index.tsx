import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  dismissFailedImports,
  importJobs,
  retryImportJob,
  useImportProgress,
} from '@/closet/importActions';
import { useItemCount } from '@/closet/useItems';
import { AppText, Button, Row, Screen } from '@/components/ui';
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
          {failed.map((job, index) => (
            <Row
              key={job.id}
              testID={`import-retry-${index}`}
              icon="refresh-outline"
              label={t('importFlow.retry')}
              value={`#${index + 1}`}
              onPress={() => void retryImportJob(job.id)}
            />
          ))}
          {failed.length > 1 ? (
            <Button
              testID="import-retry-all"
              icon="refresh-outline"
              label={t('importFlow.retryAll')}
              onPress={() => {
                for (const job of failed) void retryImportJob(job.id);
              }}
            />
          ) : null}
          <Button
            testID="import-dismiss-failed"
            kind="secondary"
            label={t('importFlow.discard')}
            onPress={() => void dismissFailedImports()}
          />
        </View>
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
