import { beforeEach, describe, expect, it, vi } from "vitest";
import { GLStateCache, type WebGLLocations } from "../GLStateCache";

describe("GLStateCache", () => {
	let gl: WebGLRenderingContext;
	let locs: WebGLLocations;
	let cache: GLStateCache;

	beforeEach(() => {
		gl = {
			uniform1i: vi.fn(),
			uniform1f: vi.fn(),
			uniform2f: vi.fn(),
			uniform4f: vi.fn(),
			lineWidth: vi.fn(),
			enableVertexAttribArray: vi.fn(),
			disableVertexAttribArray: vi.fn(),
			vertexAttrib1f: vi.fn(),
			vertexAttrib2f: vi.fn(),
		} as unknown as WebGLRenderingContext;

		locs = {
			xLoc: 0,
			yLoc: 1,
			otherLoc: 2,
			tLoc: 3,
			distStartLoc: 4,
			xScaleOffLoc: {} as WebGLUniformLocation,
			yScaleOffLoc: {} as WebGLUniformLocation,
			padLoc: {} as WebGLUniformLocation,
			resLoc: {} as WebGLUniformLocation,
			colorLoc: {} as WebGLUniformLocation,
			styleLoc: {} as WebGLUniformLocation,
			lineStyleLoc: {} as WebGLUniformLocation,
			dprLoc: {} as WebGLUniformLocation,
			sizeLoc: {} as WebGLUniformLocation,
			screenSpaceLoc: {} as WebGLUniformLocation,
		};

		cache = new GLStateCache(gl, locs);
	});

	describe("setColor", () => {
		it("sets color and caches it", () => {
			cache.setColor(1, 0, 0, 1);
			expect(gl.uniform4f).toHaveBeenCalledWith(locs.colorLoc, 1, 0, 0, 1);
			expect(gl.uniform4f).toHaveBeenCalledTimes(1);

			cache.setColor(1, 0, 0, 1);
			expect(gl.uniform4f).toHaveBeenCalledTimes(1);

			cache.setColor(0, 1, 0, 1);
			expect(gl.uniform4f).toHaveBeenCalledWith(locs.colorLoc, 0, 1, 0, 1);
			expect(gl.uniform4f).toHaveBeenCalledTimes(2);
		});
	});

	describe("setStyle", () => {
		it("sets style and caches it", () => {
			cache.setStyle(1);
			expect(gl.uniform1i).toHaveBeenCalledWith(locs.styleLoc, 1);
			expect(gl.uniform1i).toHaveBeenCalledTimes(1);

			cache.setStyle(1);
			expect(gl.uniform1i).toHaveBeenCalledTimes(1);

			cache.setStyle(2);
			expect(gl.uniform1i).toHaveBeenCalledWith(locs.styleLoc, 2);
			expect(gl.uniform1i).toHaveBeenCalledTimes(2);
		});
	});

	describe("setLineStyle", () => {
		it("sets line style and caches it", () => {
			cache.setLineStyle(1);
			expect(gl.uniform1i).toHaveBeenCalledWith(locs.lineStyleLoc, 1);
			expect(gl.uniform1i).toHaveBeenCalledTimes(1);

			cache.setLineStyle(1);
			expect(gl.uniform1i).toHaveBeenCalledTimes(1);

			cache.setLineStyle(2);
			expect(gl.uniform1i).toHaveBeenCalledWith(locs.lineStyleLoc, 2);
			expect(gl.uniform1i).toHaveBeenCalledTimes(2);
		});
	});

	describe("setScreenSpace", () => {
		it("sets screen space and caches it", () => {
			cache.setScreenSpace(1);
			expect(gl.uniform1i).toHaveBeenCalledWith(locs.screenSpaceLoc, 1);
			expect(gl.uniform1i).toHaveBeenCalledTimes(1);

			cache.setScreenSpace(1);
			expect(gl.uniform1i).toHaveBeenCalledTimes(1);

			cache.setScreenSpace(0);
			expect(gl.uniform1i).toHaveBeenCalledWith(locs.screenSpaceLoc, 0);
			expect(gl.uniform1i).toHaveBeenCalledTimes(2);
		});
	});

	describe("setPointSize", () => {
		it("sets point size and caches it", () => {
			cache.setPointSize(5);
			expect(gl.uniform1f).toHaveBeenCalledWith(locs.sizeLoc, 5);
			expect(gl.uniform1f).toHaveBeenCalledTimes(1);

			cache.setPointSize(5);
			expect(gl.uniform1f).toHaveBeenCalledTimes(1);

			cache.setPointSize(10);
			expect(gl.uniform1f).toHaveBeenCalledWith(locs.sizeLoc, 10);
			expect(gl.uniform1f).toHaveBeenCalledTimes(2);
		});
	});

	describe("setLineWidth", () => {
		it("sets line width and caches it", () => {
			cache.setLineWidth(2);
			expect(gl.lineWidth).toHaveBeenCalledWith(2);
			expect(gl.lineWidth).toHaveBeenCalledTimes(1);

			cache.setLineWidth(2);
			expect(gl.lineWidth).toHaveBeenCalledTimes(1);

			cache.setLineWidth(4);
			expect(gl.lineWidth).toHaveBeenCalledWith(4);
			expect(gl.lineWidth).toHaveBeenCalledTimes(2);
		});
	});

	describe("setXScaleOff", () => {
		it("sets X scale/offset and caches it", () => {
			cache.setXScaleOff(2, 5);
			expect(gl.uniform2f).toHaveBeenCalledWith(locs.xScaleOffLoc, 2, 5);
			expect(gl.uniform2f).toHaveBeenCalledTimes(1);

			cache.setXScaleOff(2, 5);
			expect(gl.uniform2f).toHaveBeenCalledTimes(1);

			cache.setXScaleOff(3, 5);
			expect(gl.uniform2f).toHaveBeenCalledWith(locs.xScaleOffLoc, 3, 5);
			expect(gl.uniform2f).toHaveBeenCalledTimes(2);
		});
	});

	describe("setYScaleOff", () => {
		it("sets Y scale/offset and caches it", () => {
			cache.setYScaleOff(2, 5);
			expect(gl.uniform2f).toHaveBeenCalledWith(locs.yScaleOffLoc, 2, 5);
			expect(gl.uniform2f).toHaveBeenCalledTimes(1);

			cache.setYScaleOff(2, 5);
			expect(gl.uniform2f).toHaveBeenCalledTimes(1);

			cache.setYScaleOff(2, 6);
			expect(gl.uniform2f).toHaveBeenCalledWith(locs.yScaleOffLoc, 2, 6);
			expect(gl.uniform2f).toHaveBeenCalledTimes(2);
		});
	});

	describe("enableAttrib", () => {
		it("enables vertex attrib array and caches it", () => {
			cache.enableAttrib(locs.xLoc);
			expect(gl.enableVertexAttribArray).toHaveBeenCalledWith(locs.xLoc);
			expect(gl.enableVertexAttribArray).toHaveBeenCalledTimes(1);

			cache.enableAttrib(locs.xLoc);
			expect(gl.enableVertexAttribArray).toHaveBeenCalledTimes(1);
		});
	});

	describe("disableAttribConst1", () => {
		it("disables vertex attrib array and sets const1, caching both", () => {
			cache.disableAttribConst1(locs.xLoc, 5);
			expect(gl.disableVertexAttribArray).toHaveBeenCalledWith(locs.xLoc);
			expect(gl.vertexAttrib1f).toHaveBeenCalledWith(locs.xLoc, 5);
			expect(gl.disableVertexAttribArray).toHaveBeenCalledTimes(1);
			expect(gl.vertexAttrib1f).toHaveBeenCalledTimes(1);

			cache.disableAttribConst1(locs.xLoc, 5);
			expect(gl.disableVertexAttribArray).toHaveBeenCalledTimes(1);
			expect(gl.vertexAttrib1f).toHaveBeenCalledTimes(1);

			cache.disableAttribConst1(locs.xLoc, 10);
			expect(gl.disableVertexAttribArray).toHaveBeenCalledTimes(1);
			expect(gl.vertexAttrib1f).toHaveBeenCalledWith(locs.xLoc, 10);
			expect(gl.vertexAttrib1f).toHaveBeenCalledTimes(2);
		});

		it("disables vertex attrib after being enabled", () => {
			cache.enableAttrib(locs.xLoc);
			cache.disableAttribConst1(locs.xLoc, 5);
			expect(gl.disableVertexAttribArray).toHaveBeenCalledWith(locs.xLoc);
			expect(gl.vertexAttrib1f).toHaveBeenCalledWith(locs.xLoc, 5);
		});
	});

	describe("disableAttribConst2", () => {
		it("disables vertex attrib array and sets const2, caching both", () => {
			cache.disableAttribConst2(locs.xLoc, 5, 10);
			expect(gl.disableVertexAttribArray).toHaveBeenCalledWith(locs.xLoc);
			expect(gl.vertexAttrib2f).toHaveBeenCalledWith(locs.xLoc, 5, 10);
			expect(gl.disableVertexAttribArray).toHaveBeenCalledTimes(1);
			expect(gl.vertexAttrib2f).toHaveBeenCalledTimes(1);

			cache.disableAttribConst2(locs.xLoc, 5, 10);
			expect(gl.disableVertexAttribArray).toHaveBeenCalledTimes(1);
			expect(gl.vertexAttrib2f).toHaveBeenCalledTimes(1);

			cache.disableAttribConst2(locs.xLoc, 5, 15);
			expect(gl.disableVertexAttribArray).toHaveBeenCalledTimes(1);
			expect(gl.vertexAttrib2f).toHaveBeenCalledWith(locs.xLoc, 5, 15);
			expect(gl.vertexAttrib2f).toHaveBeenCalledTimes(2);
		});
	});

	describe("reset", () => {
		it("resets cache state", () => {
			cache.setColor(1, 0, 0, 1);
			expect(gl.uniform4f).toHaveBeenCalledTimes(1);

			cache.reset();

			cache.setColor(1, 0, 0, 1);
			expect(gl.uniform4f).toHaveBeenCalledTimes(2);

			cache.setStyle(1);
			expect(gl.uniform1i).toHaveBeenCalledTimes(1);

			cache.reset();
			cache.setStyle(1);
			expect(gl.uniform1i).toHaveBeenCalledTimes(2);

			cache.enableAttrib(locs.xLoc);
			expect(gl.enableVertexAttribArray).toHaveBeenCalledTimes(1);

			cache.reset();
			cache.enableAttrib(locs.xLoc);
			expect(gl.enableVertexAttribArray).toHaveBeenCalledTimes(2);
		});
	});
});
