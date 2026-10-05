export type ThemeColors = {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  onPrimary: string;
  danger: string;
  success: string;
  overlay: string;
};

export const lightColors: ThemeColors = {
  background: '#FBF9FD',
  surface: '#FFFFFF',
  surfaceAlt: '#F1ECF7',
  text: '#1B1622',
  textMuted: '#6D6478',
  border: '#E3DCEC',
  primary: '#1B1622',
  onPrimary: '#FFFFFF',
  danger: '#C4314B',
  success: '#2E7D4F',
  overlay: 'rgba(20, 14, 28, 0.45)',
};

export const darkColors: ThemeColors = {
  background: '#121016',
  surface: '#1C1922',
  surfaceAlt: '#26222E',
  text: '#F4F0F8',
  textMuted: '#A49BB0',
  border: '#332E3D',
  primary: '#F4F0F8',
  onPrimary: '#121016',
  danger: '#FF7A90',
  success: '#6FCF97',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 20, pill: 999 } as const;

export const typography = {
  title: { fontSize: 28, fontWeight: '700' as const },
  heading: { fontSize: 20, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  label: { fontSize: 14, fontWeight: '500' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
};

export type Theme = {
  dark: boolean;
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
};

export const lightTheme: Theme = { dark: false, colors: lightColors, spacing, radius, typography };
export const darkTheme: Theme = { dark: true, colors: darkColors, spacing, radius, typography };
