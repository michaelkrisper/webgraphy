import type { GLStateCache } from "./GLStateCache";

export interface OverlayState {
	packed: Float32Array;
	packedLen: number;
	groups: Array<{
		topology: "LINES" | "TRIANGLES";
		rgba: [number, number, number, number];
		width: number;
		offset: number;
		count: number;
	}>;
}

export function drawOverlay(
	st: GLStateCache,
	overlay: OverlayState,
	overlayBuf: WebGLBuffer,
): void {
	const { gl, locs } = st;
	if (overlay.packedLen <= 0 || overlay.groups.length === 0) return;

	st.useMain();
	st.setScreenSpace(1);
	st.setStyle(3);
	st.setLineStyle(0);
	st.disableAttribConst2(locs.otherLoc, 0, 0);
	st.disableAttribConst1(locs.tLoc, 0);
	st.disableAttribConst1(locs.distStartLoc, 0);

	gl.bindBuffer(gl.ARRAY_BUFFER, overlayBuf);
	gl.bufferData(
		gl.ARRAY_BUFFER,
		overlay.packed.subarray(0, overlay.packedLen),
		gl.STREAM_DRAW,
	);
	st.enableAttrib(locs.xLoc);
	gl.vertexAttribPointer(locs.xLoc, 1, gl.FLOAT, false, 8, 0);
	st.enableAttrib(locs.yLoc);
	gl.vertexAttribPointer(locs.yLoc, 1, gl.FLOAT, false, 8, 4);

	for (const grp of overlay.groups) {
		if (grp.count === 0) continue;
		const c = grp.rgba;
		st.setColor(c[0], c[1], c[2], c[3]);
		if (grp.topology === "LINES") {
			st.setLineWidth(grp.width);
			gl.drawArrays(gl.LINES, grp.offset, grp.count);
		} else {
			gl.drawArrays(gl.TRIANGLES, grp.offset, grp.count);
		}
	}
}
