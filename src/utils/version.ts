/**
 * Release form of the build version: "1.2.0-219-gabc1234-dirty" (git
 * describe between tags) or "1.2.0+abc1234" (no tag reachable) both read
 * "v1.2.0". Anything without a leading x.y.z is shown as it is.
 */
export function releaseVersion(raw: string): string {
	const m = /^v?(\d+\.\d+\.\d+)/.exec(raw);
	return m ? `v${m[1]}` : raw;
}
