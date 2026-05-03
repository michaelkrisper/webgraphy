export type ThemeName = 'light' | 'dark' | 'matrix' | 'unicorn';

export interface Theme {
  fontFamily: string;
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
  // Publication White — print-ready, IEEE/Nature journal standard
  // Palette: GitHub Primer Light (battle-tested, WCAG AA throughout)
  light: {
    fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
    bg:             '#ffffff',  // pure white — prints clean
    bg2:            '#f6f8fa',  // sidebar body — barely-there tint
    bg3:            '#eaeef2',  // tertiary surface
    border:         '#d0d7de',  // crisp, not loud
    border2:        '#bdc4cc',
    text:           '#1f2328',  // near-black — 15:1 contrast on white
    textMid:        '#24292f',
    textMuted:      '#57606a',  // 4.6:1 — passes AA
    textLight:      '#6e7781',
    accent:         '#0969da',  // IEEE blue — saturated but not childish
    danger:         '#cf222e',
    shadow:         'rgba(31,35,40,0.08)',
    selectBg:       '#ffffff',  selectColor:    '#24292f',
    btnBorder:      '#d0d7de',  btnColor:       '#24292f',
    cardBorder:     '#d0d7de',  sectionHeaderBg:'#f6f8fa',
    // Chart — optimised for screen and print export
    plotBg:         '#ffffff',
    axisColor:      '#24292f',  // strong axis spine — reads in print
    zeroLineColor:  '#8c959f',  // subtler reference line
    gridColor:      '#dde1e6',
    labelColor:     '#57606a',
    secLabelBg:     'rgba(255,255,255,0.93)',
    tooltipBg:      'rgba(255,255,255,0.97)',
    tooltipColor:   '#1f2328',
    tooltipBorder:  '#d0d7de',
    snapLineColor:  '#d0d7de',
    tooltipDividerColor: 'rgba(31,35,40,0.07)',
    tooltipSubColor:'#57606a',
    noDataColor:    '#d0d7de',
  },

  // Engineering Dark — OLED-friendly, VS Code / JetBrains standard
  // Palette: GitHub Primer Dark (same system — consistent semantics)
  dark: {
    fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
    bg:             '#161b22',  // card surface
    bg2:            '#0d1117',  // page background — true dark
    bg3:            '#1c2128',  // inset / tertiary
    border:         '#30363d',  // GitHub dark separator
    border2:        '#3d444d',
    text:           '#e6edf3',  // primary — 14:1 on bg2
    textMid:        '#cdd9e5',
    textMuted:      '#8b949e',  // 4.5:1 — passes AA
    textLight:      '#484f58',
    accent:         '#388bfd',  // calibrated for dark bg — less saturated than light
    danger:         '#f85149',
    shadow:         'rgba(0,0,0,0.5)',
    selectBg:       '#1c2128',  selectColor:    '#cdd9e5',
    btnBorder:      '#30363d',  btnColor:       '#8b949e',
    cardBorder:     '#30363d',  sectionHeaderBg:'#0d1117',
    // Chart
    plotBg:         '#0d1117',  // same as page bg — seamless
    axisColor:      '#6e7681',  // visible but not glaring
    zeroLineColor:  '#30363d',
    gridColor:      '#272e36',
    labelColor:     '#8b949e',
    secLabelBg:     'rgba(13,17,23,0.93)',
    tooltipBg:      'rgba(22,27,34,0.97)',
    tooltipColor:   '#e6edf3',
    tooltipBorder:  '#30363d',
    snapLineColor:  '#3d444d',
    tooltipDividerColor: 'rgba(255,255,255,0.05)',
    tooltipSubColor:'#8b949e',
    noDataColor:    '#21262d',
  },
  matrix: {
    fontFamily: '"Courier New", monospace',
    bg: '#001400', bg2: '#000a00', bg3: '#001a00',
    border: '#003300', border2: '#005500',
    text: '#00ff41', textMid: '#00cc33', textMuted: '#009922', textLight: '#005500',
    accent: '#00ff41', danger: '#ff4444',
    shadow: 'rgba(0,255,65,0.1)',
    selectBg: '#000a00', selectColor: '#00ff41',
    btnBorder: '#003300', btnColor: '#00cc33',
    cardBorder: '#003300', sectionHeaderBg: '#000a00',
    plotBg: '#000000', axisColor: '#00aa22', zeroLineColor: '#004400', gridColor: '#004400',
    labelColor: '#00cc33', secLabelBg: 'rgba(0,0,0,0.88)',
    tooltipBg: 'rgba(0,8,0,0.96)', tooltipColor: '#00ff41', tooltipBorder: '#005500',
    snapLineColor: '#006600', tooltipDividerColor: 'rgba(0,255,65,0.1)', tooltipSubColor: '#009922',
    noDataColor: '#003300',
  },
  unicorn: {
    fontFamily: '"Comic Sans MS", cursive',
    bg: '#fff0f9', bg2: '#fce4f0', bg3: '#fad4e8',
    border: '#f9a8d4', border2: '#f472b6',
    text: '#7b2d8b', textMid: '#9333a1', textMuted: '#c026d3', textLight: '#e879f9',
    accent: '#f472b6', danger: '#f43f5e',
    shadow: 'rgba(244,114,182,0.2)',
    selectBg: '#fff0f9', selectColor: '#7b2d8b',
    btnBorder: '#f9a8d4', btnColor: '#c026d3',
    cardBorder: '#f9a8d4', sectionHeaderBg: '#fce4f0',
    plotBg: '#fff0f9', axisColor: '#c026d3', zeroLineColor: '#f9a8d4', gridColor: '#f0a8d8',
    labelColor: '#c026d3', secLabelBg: 'rgba(255,240,249,0.9)',
    tooltipBg: 'rgba(255,240,249,0.97)', tooltipColor: '#7b2d8b', tooltipBorder: '#f9a8d4',
    snapLineColor: '#f9a8d4', tooltipDividerColor: 'rgba(244,114,182,0.15)', tooltipSubColor: '#c026d3',
    noDataColor: '#f9a8d4',
  },
};

export const COLOR_PALETTE = [
  '#2563eb', '#e11d48', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#ea580c'
];

export const THEME_CYCLE: ThemeName[] = ['light', 'dark', 'matrix', 'unicorn'];
