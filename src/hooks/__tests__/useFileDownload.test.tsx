import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useFileDownload } from "../useFileDownload";
import { downloadFile } from "../../services/export";

vi.mock("../../services/export", () => ({
  downloadFile: vi.fn(),
}));

describe("useFileDownload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call downloadFile with correct arguments", () => {
    const { result } = renderHook(() => useFileDownload());
    result.current("content", "test.txt", "text/plain");
    expect(downloadFile).toHaveBeenCalledWith(
      "content",
      "test.txt",
      "text/plain",
    );
  });

  it("should execute cleanup functions on unmount", () => {
    const cleanupMock = vi.fn();
    vi.mocked(downloadFile).mockReturnValue(cleanupMock);

    const { result, unmount } = renderHook(() => useFileDownload());
    result.current("content", "test.txt", "text/plain");

    expect(cleanupMock).not.toHaveBeenCalled();
    unmount();
    expect(cleanupMock).toHaveBeenCalledTimes(1);
  });
});
