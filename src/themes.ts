export type ThemeName = 'light' | 'dark' | 'matrix' | 'classic' | 'unicorn';

export interface Theme {
  // Sidebar / UI
  bg: string;
  bg2: string;
  bg3: string;
  border: string;
  border2: string;
  text: string;
  textMid: string;
  textMuted: string;
  textLight: string;
  accent: string;
  danger: string;
  shadow: string;
  selectBg: string;
  selectColor: string;
  btnBorder: string;
  btnColor: string;
  cardBorder: string;
  sectionHeaderBg: string;
  // Chart
  plotBg: string;
  axisColor: string;
  zeroLineColor: string;
  gridColor: string;
  labelColor: string;
  secLabelBg: string;
  tooltipBg: string;
  tooltipColor: string;
  tooltipBorder: string;
  snapLineColor: string;
  tooltipDividerColor: string;
  tooltipSubColor: string;
  noDataColor: string;
}

export const THEMES: Record<ThemeName, Theme> = {
  light: {
    bg: '#ffffff', bg2: '#f8fafc', bg3: '#f1f5f9',
    border: '#e2e8f0', border2: '#cbd5e1',
    text: '#1e293b', textMid: '#334155', textMuted: '#64748b', textLight: '#94a3b8',
    accent: '#3b82f6', danger: '#ef4444',
    shadow: 'rgba(0,0,0,0.05)',
    selectBg: '#f8fafc', selectColor: '#475569',
    btnBorder: '#e2e8f0', btnColor: '#475569',
    cardBorder: '#e2e8f0', sectionHeaderBg: '#f8fafc',
    plotBg: '#ffffff', axisColor: '#475569', zeroLineColor: '#94a3b8', gridColor: '#f1f5f9',
    labelColor: '#475569', secLabelBg: 'rgba(255,255,255,0.8)',
    tooltipBg: 'rgba(255,255,255,0.95)', tooltipColor: '#1e293b', tooltipBorder: '#e2e8f0',
    snapLineColor: '#cbd5e1', tooltipDividerColor: 'rgba(0,0,0,0.05)', tooltipSubColor: '#64748b',
    noDataColor: '#d1d5db',
  },
  dark: {
    bg: '#1e293b', bg2: '#0f172a', bg3: '#1e293b',
    border: '#334155', border2: '#475569',
    text: '#f1f5f9', textMid: '#e2e8f0', textMuted: '#94a3b8', textLight: '#64748b',
    accent: '#60a5fa', danger: '#f87171',
    shadow: 'rgba(0,0,0,0.3)',
    selectBg: '#1e293b', selectColor: '#e2e8f0',
    btnBorder: '#334155', btnColor: '#94a3b8',
    cardBorder: '#334155', sectionHeaderBg: '#0f172a',
    plotBg: '#0f172a', axisColor: '#64748b', zeroLineColor: '#475569', gridColor: '#1e3a5f',
    labelColor: '#94a3b8', secLabelBg: 'rgba(15,23,42,0.85)',
    tooltipBg: 'rgba(15,23,42,0.95)', tooltipColor: '#f1f5f9', tooltipBorder: '#334155',
    snapLineColor: '#475569', tooltipDividerColor: 'rgba(255,255,255,0.05)', tooltipSubColor: '#94a3b8',
    noDataColor: '#334155',
  },
  matrix: {
    bg: '#001400', bg2: '#000a00', bg3: '#001a00',
    border: '#003300', border2: '#005500',
    text: '#00ff41', textMid: '#00cc33', textMuted: '#009922', textLight: '#005500',
    accent: '#00ff41', danger: '#ff4444',
    shadow: 'rgba(0,255,65,0.1)',
    selectBg: '#000a00', selectColor: '#00ff41',
    btnBorder: '#003300', btnColor: '#00cc33',
    cardBorder: '#003300', sectionHeaderBg: '#000a00',
    plotBg: '#000000', axisColor: '#00aa22', zeroLineColor: '#004400', gridColor: '#001500',
    labelColor: '#00cc33', secLabelBg: 'rgba(0,0,0,0.88)',
    tooltipBg: 'rgba(0,8,0,0.96)', tooltipColor: '#00ff41', tooltipBorder: '#005500',
    snapLineColor: '#006600', tooltipDividerColor: 'rgba(0,255,65,0.1)', tooltipSubColor: '#009922',
    noDataColor: '#003300',
  },
  classic: {
    bg: '#ffffff', bg2: '#c0c0c0', bg3: '#d4d0c8',
    border: '#808080', border2: '#404040',
    text: '#000000', textMid: '#000000', textMuted: '#333333', textLight: '#808080',
    accent: '#000080', danger: '#800000',
    shadow: 'rgba(0,0,0,0.3)',
    selectBg: '#ffffff', selectColor: '#000000',
    btnBorder: '#808080', btnColor: '#000000',
    cardBorder: '#808080', sectionHeaderBg: '#c0c0c0',
    plotBg: '#ffffff', axisColor: '#000000', zeroLineColor: '#808080', gridColor: '#e0e0e0',
    labelColor: '#000000', secLabelBg: 'rgba(192,192,192,0.92)',
    tooltipBg: 'rgba(255,255,255,0.98)', tooltipColor: '#000000', tooltipBorder: '#000000',
    snapLineColor: '#808080', tooltipDividerColor: 'rgba(0,0,0,0.15)', tooltipSubColor: '#444444',
    noDataColor: '#aaaaaa',
  },
  unicorn: {
    bg: '#fff0f9', bg2: '#fce4f0', bg3: '#fad4e8',
    border: '#f9a8d4', border2: '#f472b6',
    text: '#7b2d8b', textMid: '#9333a1', textMuted: '#c026d3', textLight: '#e879f9',
    accent: '#f472b6', danger: '#f43f5e',
    shadow: 'rgba(244,114,182,0.2)',
    selectBg: '#fff0f9', selectColor: '#7b2d8b',
    btnBorder: '#f9a8d4', btnColor: '#c026d3',
    cardBorder: '#f9a8d4', sectionHeaderBg: '#fce4f0',
    plotBg: '#fff0f9', axisColor: '#c026d3', zeroLineColor: '#f9a8d4', gridColor: '#fce4f0',
    labelColor: '#c026d3', secLabelBg: 'rgba(255,240,249,0.9)',
    tooltipBg: 'rgba(255,240,249,0.97)', tooltipColor: '#7b2d8b', tooltipBorder: '#f9a8d4',
    snapLineColor: '#f9a8d4', tooltipDividerColor: 'rgba(244,114,182,0.15)', tooltipSubColor: '#c026d3',
    noDataColor: '#f9a8d4',
  },
};

export const THEME_CYCLE: ThemeName[] = ['light', 'dark', 'matrix', 'classic', 'unicorn'];
