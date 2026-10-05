import { getLocales } from 'expo-localization';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Field } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

import { Chips, toggled } from './Chips';
import {
  fromFormValues,
  toFormValues,
  type ItemFormError,
  type ItemFormValues,
} from './itemFormLogic';
import {
  CATEGORIES,
  COLOURS,
  COLOUR_NAMES,
  OCCASIONS,
  SEASONS,
  SUBCATEGORIES,
  WARMTH_LEVELS,
} from './taxonomy';
import type { ItemDetails } from './types';

type SuggestedField =
  'name' | 'category' | 'subcategory' | 'colours' | 'seasons' | 'occasions' | 'warmth' | 'brand';

type Props = {
  initial: Partial<ItemDetails>;
  /** Fields pre-filled by automatic tagging; marked until the user changes them. */
  suggested?: SuggestedField[];
  submitLabel: string;
  busy?: boolean;
  onSubmit: (details: ItemDetails) => void;
  /** Extra actions shown under the save button. */
  footer?: ReactNode;
};

/** The form for an item's details, used when adding, editing and reviewing. */
export function ItemForm({ initial, suggested = [], submitLabel, busy, onSubmit, footer }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const [values, setValues] = useState<ItemFormValues>(() =>
    toFormValues(initial, getLocales()[0]?.currencyCode ?? 'EUR'),
  );
  const [marked, setMarked] = useState<SuggestedField[]>(suggested);
  const [error, setError] = useState<ItemFormError | null>(null);

  const set = <K extends keyof ItemFormValues>(key: K, value: ItemFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setMarked((current) => current.filter((field) => field !== key));
    setError(null);
  };

  const submit = () => {
    const result = fromFormValues(values);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSubmit(result.details);
  };

  const Section = ({
    field,
    label,
    children,
  }: {
    field: keyof ItemFormValues;
    label: string;
    children: ReactNode;
  }) => (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <AppText variant="label" muted>
          {label}
        </AppText>
        {marked.includes(field as SuggestedField) ? (
          <View
            testID={`suggested-${field}`}
            style={{
              backgroundColor: colors.surfaceAlt,
              borderRadius: radius.pill,
              paddingHorizontal: spacing.sm,
              paddingVertical: 2,
            }}
          >
            <AppText variant="caption">{t('itemForm.suggested')}</AppText>
          </View>
        ) : null}
      </View>
      {children}
    </View>
  );

  return (
    <View style={{ gap: spacing.xl }}>
      {Section({
        field: 'name',
        label: t('itemForm.name'),
        children: (
          <Field
            testID="item-name"
            value={values.name}
            onChangeText={(text) => set('name', text)}
          />
        ),
      })}

      {Section({
        field: 'category',
        label: t('itemForm.category'),
        children: (
          <>
            <Chips
              testIDPrefix="category"
              options={CATEGORIES.map((value) => ({
                value,
                label: t(`taxonomy.category.${value}`),
              }))}
              selected={values.category ? [values.category] : []}
              onToggle={(value) => set('category', value)}
            />
            {error === 'categoryRequired' ? (
              <AppText testID="item-form-error" style={{ color: colors.danger }}>
                {t('itemForm.categoryRequired')}
              </AppText>
            ) : null}
          </>
        ),
      })}

      {values.category
        ? Section({
            field: 'subcategory',
            label: t('itemForm.subcategory'),
            children: (
              <Chips
                testIDPrefix="subcategory"
                options={SUBCATEGORIES[values.category].map((value) => ({
                  value,
                  label: t(`taxonomy.subcategory.${value}`),
                }))}
                selected={values.subcategory ? [values.subcategory] : []}
                onToggle={(value) =>
                  set('subcategory', values.subcategory === value ? null : value)
                }
              />
            ),
          })
        : null}

      {Section({
        field: 'colours',
        label: t('itemForm.colours'),
        children: (
          <Chips
            testIDPrefix="colour"
            options={COLOUR_NAMES.map((value) => ({
              value,
              label: t(`taxonomy.colour.${value}`),
              swatch: COLOURS[value],
            }))}
            selected={values.colours}
            onToggle={(value) => set('colours', toggled(values.colours, value))}
          />
        ),
      })}

      {Section({
        field: 'seasons',
        label: t('itemForm.seasons'),
        children: (
          <Chips
            testIDPrefix="season"
            options={SEASONS.map((value) => ({ value, label: t(`taxonomy.season.${value}`) }))}
            selected={values.seasons}
            onToggle={(value) => set('seasons', toggled(values.seasons, value))}
          />
        ),
      })}

      {Section({
        field: 'occasions',
        label: t('itemForm.occasions'),
        children: (
          <Chips
            testIDPrefix="occasion"
            options={OCCASIONS.map((value) => ({ value, label: t(`taxonomy.occasion.${value}`) }))}
            selected={values.occasions}
            onToggle={(value) => set('occasions', toggled(values.occasions, value))}
          />
        ),
      })}

      {Section({
        field: 'warmth',
        label: t('itemForm.warmth'),
        children: (
          <Chips
            testIDPrefix="warmth"
            options={WARMTH_LEVELS.map((value) => ({
              value,
              label: t(`taxonomy.warmth.${value}`),
            }))}
            selected={values.warmth ? [values.warmth] : []}
            onToggle={(value) => set('warmth', values.warmth === value ? null : value)}
          />
        ),
      })}

      {Section({
        field: 'brand',
        label: t('itemForm.brand'),
        children: (
          <Field
            testID="item-brand"
            value={values.brand}
            onChangeText={(text) => set('brand', text)}
          />
        ),
      })}

      <Field
        testID="item-size"
        label={t('itemForm.size')}
        value={values.size}
        onChangeText={(text) => set('size', text)}
      />

      <View style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 2 }}>
            <Field
              testID="item-price"
              label={t('itemForm.price')}
              value={values.price}
              onChangeText={(text) => set('price', text)}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              testID="item-currency"
              label={t('itemForm.currency')}
              value={values.currency}
              onChangeText={(text) => set('currency', text)}
            />
          </View>
        </View>
        {error === 'priceInvalid' ? (
          <AppText testID="item-form-error" style={{ color: colors.danger }}>
            {t('itemForm.priceInvalid')}
          </AppText>
        ) : null}
      </View>

      <View style={{ gap: spacing.sm }}>
        <Field
          testID="item-purchased"
          label={t('itemForm.purchasedAt')}
          value={values.purchasedAt}
          onChangeText={(text) => set('purchasedAt', text)}
          placeholder={t('itemForm.purchasedAtPlaceholder')}
          keyboardType="numbers-and-punctuation"
        />
        {error === 'purchasedAtInvalid' ? (
          <AppText testID="item-form-error" style={{ color: colors.danger }}>
            {t('itemForm.purchasedAtInvalid')}
          </AppText>
        ) : null}
      </View>

      <Field
        testID="item-notes"
        label={t('itemForm.notes')}
        value={values.notes}
        onChangeText={(text) => set('notes', text)}
      />

      <Button testID="item-save" label={submitLabel} loading={busy} onPress={submit} />
      {footer}
    </View>
  );
}
