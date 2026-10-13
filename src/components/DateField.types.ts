export type DateFieldProps = {
  label: string;
  /** Local calendar day (YYYY-MM-DD), or empty when unset. */
  value: string;
  onChange: (value: string) => void;
  testID: string;
  clearable?: boolean;
  disabled?: boolean;
};
