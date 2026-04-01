// FinchWire YouTube-inspired Theme

export const colors = {
  // Primary brand colors
  primary: '#FF0000', // YouTube red
  primaryDark: '#CC0000',
  primaryLight: '#FF4444',
  
  // Background colors (dark theme)
  background: '#0F0F0F', // YouTube dark background
  backgroundLight: '#1F1F1F',
  surface: '#272727',
  surfaceLight: '#3F3F3F',
  
  // Text colors
  text: '#FFFFFF',
  textSecondary: '#AAAAAA',
  textTertiary: '#717171',
  
  // Status colors
  success: '#00C853',
  warning: '#FFB300',
  error: '#FF5252',
  info: '#2196F3',
  
  // UI elements
  border: '#303030',
  divider: '#303030',
  overlay: 'rgba(0, 0, 0, 0.8)',
  
  // Button colors
  buttonPrimary: '#FF0000',
  buttonSecondary: '#3F3F3F',
  buttonText: '#FFFFFF',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const typography = {
  h1: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: colors.text,
  },
  h2: {
    fontSize: 24,
    fontWeight: '600' as const,
    color: colors.text,
  },
  h3: {
    fontSize: 20,
    fontWeight: '600' as const,
    color: colors.text,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    color: colors.text,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: '400' as const,
    color: colors.textSecondary,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
    color: colors.textTertiary,
  },
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
};
