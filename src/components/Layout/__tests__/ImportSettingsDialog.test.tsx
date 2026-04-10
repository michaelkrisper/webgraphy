import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ImportSettingsDialog } from '../ImportSettingsDialog';

describe('ImportSettingsDialog', () => {
  it('handles invalid JSON gracefully', () => {
    const invalidJson = '{"broken": json';
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    // Mock console.error if needed, though secureJSONParse might throw directly handled by catch block.
    // ImportSettingsDialog's catch block doesn't log to console based on my investigation, it just returns empty arrays.

    render(
      <ImportSettingsDialog
        fileName="test.json"
        fileContent={invalidJson}
        fileType="json"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    // Verify it renders the base dialog title
    expect(screen.getByText('Import Settings: test.json')).toBeDefined();

    // Verify it doesn't crash and renders the fallback empty table headers
    // When error occurs, previewData.headers is [] and previewData.rows is []
    // so no column configurations are rendered (no inputs with role column header)
    const inputs = screen.queryAllByRole('textbox', { name: /Column .* name/i });
    expect(inputs).toHaveLength(0);
  });
});
