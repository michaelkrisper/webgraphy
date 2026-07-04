import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRegisterSW = vi.fn();
const mockRender = vi.fn();
const mockCreateRoot = vi.fn(() => ({ render: mockRender }));

vi.mock('virtual:pwa-register', () => ({
  registerSW: mockRegisterSW,
}));

vi.mock('react-dom/client', () => ({
  default: {
    createRoot: mockCreateRoot,
  },
}));

vi.mock('./App', () => ({
  default: () => <div>Mock App</div>,
}));

describe('main.tsx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    document.body.innerHTML = '';
  });

  it('renders the App when root element exists', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);

    await import('./main');

    expect(mockRegisterSW).toHaveBeenCalledWith({ immediate: true });
    expect(mockCreateRoot).toHaveBeenCalledWith(root);
    expect(mockRender).toHaveBeenCalled();
  });

  it('does not call createRoot when root element is missing', async () => {
    await import('./main');

    expect(mockRegisterSW).toHaveBeenCalledWith({ immediate: true });
    expect(mockCreateRoot).not.toHaveBeenCalled();
  });
});
