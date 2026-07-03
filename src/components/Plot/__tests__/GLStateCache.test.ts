import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	GLStateCache,
	type LineProgramLocations,
	type WebGLLocations,
} from "../GLStateCache";

describe("GLStateCache", () => {
	let gl: WebGL2RenderingContext;
	let locs: WebGLLocations;
	let cache: GLStateCache;

	beforeEach(() => {
		gl = {
			uniform1i: vi.fn(),
			uniform1f: vi.fn(),
			uniform2f: vi.fn(),
			uniform4f: vi.fn(),
			lineWidth: vi.fn(),
			useProgram: vi.fn(),
			enableVertexAttribArray: vi.fn(),
			disableVertexAttribArray: vi.fn(),
			vertexAttrib1f: vi.fn(),
			vertexAttrib2f: vi.fn(),
			vertexAttribDivisor: vi.fn(),
		} as unknown as WebGL2RenderingContext;

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

		it("pins the divisor per attribute and caches it", () => {
			cache.enableAttrib(locs.xLoc, 0);
			expect(gl.vertexAttribDivisor).toHaveBeenCalledWith(locs.xLoc, 0);
			expect(gl.vertexAttribDivisor).toHaveBeenCalledTimes(1);

			// Same divisor -> cached, no driver call.
			cache.enableAttrib(locs.xLoc, 0);
			expect(gl.vertexAttribDivisor).toHaveBeenCalledTimes(1);

			// Instanced rebind of the same attribute index updates the divisor.
			cache.enableAttrib(locs.xLoc, 1);
			expect(gl.vertexAttribDivisor).toHaveBeenCalledWith(locs.xLoc, 1);
			expect(gl.vertexAttribDivisor).toHaveBeenCalledTimes(2);
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

	describe("program switching and line-program uniforms", () => {
		let lineLocs: LineProgramLocations;
		let mainProgram: WebGLProgram;
		let lineProgram: WebGLProgram;

		beforeEach(() => {
			lineLocs = {
				x0Loc: 5,
				y0Loc: 6,
				x1Loc: 7,
				y1Loc: 8,
				dist0Loc: 9,
				xScaleOffLoc: {} as WebGLUniformLocation,
				yScaleOffLoc: {} as WebGLUniformLocation,
				resLoc: {} as WebGLUniformLocation,
				colorLoc: {} as WebGLUniformLocation,
				widthLoc: {} as WebGLUniformLocation,
				dashLoc: {} as WebGLUniformLocation,
			};
			mainProgram = {} as WebGLProgram;
			lineProgram = {} as WebGLProgram;
			cache.setPrograms(mainProgram, lineProgram, lineLocs);
		});

		it("caches useProgram across useMain/useLine switches", () => {
			cache.useMain();
			expect(gl.useProgram).toHaveBeenCalledWith(mainProgram);
			cache.useMain();
			expect(gl.useProgram).toHaveBeenCalledTimes(1);

			cache.useLine();
			expect(gl.useProgram).toHaveBeenCalledWith(lineProgram);
			cache.useLine();
			expect(gl.useProgram).toHaveBeenCalledTimes(2);
		});

		it("is a no-op without programs (unit-test / GL-less path)", () => {
			const bare = new GLStateCache(gl, locs);
			bare.useMain();
			bare.useLine();
			expect(gl.useProgram).not.toHaveBeenCalled();
		});

		it("binds the line program before writing its uniforms", () => {
			cache.lpSetColor(0, 1, 0, 1);
			expect(gl.useProgram).toHaveBeenCalledWith(lineProgram);
			expect(gl.uniform4f).toHaveBeenCalledWith(lineLocs.colorLoc, 0, 1, 0, 1);
		});

		it("binds the main program before writing main uniforms", () => {
			cache.useLine();
			cache.setColor(1, 0, 0, 1);
			expect(gl.useProgram).toHaveBeenLastCalledWith(mainProgram);
			expect(gl.uniform4f).toHaveBeenCalledWith(locs.colorLoc, 1, 0, 0, 1);
		});

		it("caches line-program uniforms independently of main uniforms", () => {
			cache.setColor(1, 0, 0, 1);
			cache.lpSetColor(1, 0, 0, 1);
			expect(gl.uniform4f).toHaveBeenCalledTimes(2);

			cache.lpSetColor(1, 0, 0, 1);
			expect(gl.uniform4f).toHaveBeenCalledTimes(2);

			cache.lpSetWidth(2);
			cache.lpSetWidth(2);
			expect(gl.uniform1f).toHaveBeenCalledWith(lineLocs.widthLoc, 2);
			expect(gl.uniform1f).toHaveBeenCalledTimes(1);

			cache.lpSetDash(8, 6);
			cache.lpSetDash(8, 6);
			expect(gl.uniform2f).toHaveBeenCalledWith(lineLocs.dashLoc, 8, 6);
			expect(gl.uniform2f).toHaveBeenCalledTimes(1);

			cache.lpSetXScaleOff(2, 5);
			cache.lpSetXScaleOff(2, 5);
			cache.lpSetYScaleOff(3, 7);
			cache.lpSetResolution(800, 600);
			cache.lpSetResolution(800, 600);
			expect(gl.uniform2f).toHaveBeenCalledTimes(4);
		});
	});
});
