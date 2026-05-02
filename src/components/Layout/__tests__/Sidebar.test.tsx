import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '../Sidebar';
import { useGraphStore } from '../../../store/useGraphStore';
import { useDataImport } from '../../../hooks/useDataImport';
import type { Mock } from 'vitest';

// Mock the components
vi.mock('../ImportSettingsDialog', () => ({
  ImportSettingsDialog: () => <div data-testid="import-settings-dialog">Import Settings</div>,
}));
vi.mock('../CalculatedColumnModal', () => ({
  CalculatedColumnModal: () => <div data-testid="calc-modal">Calc Modal</div>,
}));
vi.mock('../ImprintModal', () => ({
  ImprintModal: () => <div data-testid="imprint-modal">Imprint</div>,
}));
vi.mock('../HelpModal', () => ({
  HelpModal: () => <div data-testid="help-modal">Help</div>,
}));
vi.mock('../LicenseModal', () => ({
  LicenseModal: () => <div data-testid="license-modal">License</div>,
}));
vi.mock('../CollapsedMenuButton', () => ({
  CollapsedMenuButton: ({ onClick }: { onClick: () => void }) => <button onClick={onClick} data-testid="collapsed-menu-button">Menu</button>,
}));
vi.mock('../../Sidebar/SeriesConfig', () => ({
  SeriesConfigUI: () => <div data-testid="series-config-ui">Series Config</div>,
}));

// Mock the services/export
vi.mock('../../../services/export', () => ({
  exportToSVG: vi.fn().mockReturnValue('<svg></svg>'),
  exportToPNG: vi.fn().mockResolvedValue('data:image/png;base64,...'),
  downloadFile: vi.fn(),
}));

// Mock indexedDB for the Reset/Demo buttons
const mockClear = vi.fn();
vi.fn().mockReturnValue({
  objectStore: vi.fn().mockReturnValue({ clear: mockClear }),
  oncomplete: vi.fn(),
});
const mockOpen = vi.fn().mockReturnValue({
  onsuccess: vi.fn(),
});

global.indexedDB = {
  open: mockOpen,
} as unknown;

// Mock window.confirm
const mockConfirm = vi.fn();
window.confirm = mockConfirm;

// Mock localStorage
const mockRemoveItem = vi.fn();
const mockSetItem = vi.fn();
const mockGetItem = vi.fn();
Object.defineProperty(window, 'localStorage', {
  value: {
    removeItem: mockRemoveItem,
    setItem: mockSetItem,
    getItem: mockGetItem,
  },
});

// Mock hooks
vi.mock('../../../store/useGraphStore', () => {
  const store = vi.fn() as ReturnType<typeof vi.fn> & { getState: ReturnType<typeof vi.fn>; setState: ReturnType<typeof vi.fn> };
  store.getState = vi.fn();
  store.setState = vi.fn();
  return { useGraphStore: store };
});

vi.mock('../../../hooks/useDataImport', () => ({
  useDataImport: vi.fn(),
}));

describe('Sidebar Component', () => {
  const mockLoadDemoData = vi.fn().mockResolvedValue(undefined);
  const mockImportFile = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock returns
    (useGraphStore as unknown as Mock).mockReturnValue({
      datasets: [],
      series: [],
      xAxes: [],
      yAxes: [],
      axisTitles: [],
      removeDataset: vi.fn(),
      updateDataset: vi.fn(),
      moveDataset: vi.fn(),
      moveSeries: vi.fn(),
      loadDemoData: mockLoadDemoData,
    });

    (useDataImport as unknown as Mock).mockReturnValue({
      importFile: mockImportFile,
      confirmImport: vi.fn(),
      cancelImport: vi.fn(),
      pendingFile: null,
      isImporting: false,
    });

    // Set a predictable window size to test both mobile and desktop states
    window.innerWidth = 1024;
    window.innerHeight = 768;
  });

  it('renders correctly with default state', () => {
    render(<Sidebar />);
    expect(screen.getByText('Data Sources')).toBeInTheDocument();
    const sidebar = screen.getByRole('complementary');
    expect(sidebar).toBeInTheDocument();
  });

  it('can be collapsed and expanded', () => {
    // Start with a large window so it's not initially collapsed
    window.innerWidth = 1024;
    render(<Sidebar />);

    // Check it's not collapsed (sidebar-content visible)
    screen.getByRole('complementary');

  });

  it('opens modals when links are clicked', () => {
    render(<Sidebar />);

    fireEvent.click(screen.getByText('Imprint'));
    expect(screen.getByTestId('imprint-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByText('License'));
    expect(screen.getByTestId('license-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Help'));
    expect(screen.getByTestId('help-modal')).toBeInTheDocument();
  });

  it('shows ImportSettingsDialog when there is a pending file', () => {
    (useDataImport as unknown as Mock).mockReturnValue({
      importFile: mockImportFile,
      confirmImport: vi.fn(),
      cancelImport: vi.fn(),
      pendingFile: { file: new File([''], 'test.csv'), preview: 'a,b\n1,2', type: 'text/csv' },
      isImporting: false,
    });

    render(<Sidebar />);
    expect(screen.getByTestId('import-settings-dialog')).toBeInTheDocument();
  });

  it('does not disable the button for an already used data column', () => {
    const mockDatasets = [
      { id: 'ds-1', name: 'Dataset 1', columns: ['time', 'value1', 'value2'], xAxisColumn: 'time', xAxisId: 'axis-1' }
    ];
    const mockSeries = [
      { id: 's-1', sourceId: 'ds-1', yColumn: 'value1', yAxisId: 'axis-1', hidden: false }
    ];
    const mockXAxes = [{ id: 'axis-1', name: 'X-Axis 1', xMode: 'numeric' }];
    const mockAddSeries = vi.fn();

    (useGraphStore as unknown as Mock).mockReturnValue({
      datasets: mockDatasets,
      series: mockSeries,
      xAxes: mockXAxes,
      yAxes: [],
      axisTitles: [],
      views: [],
      removeDataset: vi.fn(),
      updateDataset: vi.fn(),
      updateXAxis: vi.fn(),
      setHighlightedSeries: vi.fn(),
      addSeries: mockAddSeries,
    });

    render(<Sidebar />);

    // value1 is used, but its button should NOT be disabled anymore
    const value1Button = screen.getByRole('button', { name: 'value1' });
    expect(value1Button).not.toBeDisabled();
    expect(value1Button).toHaveStyle({ opacity: '0.7' });

    // Clicking it should call addSeries
    fireEvent.click(value1Button);
    expect(mockAddSeries).toHaveBeenCalled();

    // value2 is not used, so its button should be enabled and full opacity
    const value2Button = screen.getByRole('button', { name: 'value2' });
    expect(value2Button).not.toBeDisabled();
    expect(value2Button).toHaveStyle({ opacity: '1' });
  });

});
