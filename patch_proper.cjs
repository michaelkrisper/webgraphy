const fs = require('fs');

const file_path = 'src/services/__tests__/demoData.test.ts';
let content = fs.readFileSync(file_path, 'utf8');

const targetStr = `describe("getDemoAppState", () => {`;
const newTest = `
		it("should apply cloud passing effect on solar irradiance and trigger wind peaks", () => {
			// First, generate base dataset with predictable randomness (e.g. 0.5) to act as a control.
			vi.spyOn(randomUtils, "secureRandom").mockReturnValue(0.5);
			const baseDataset = generateDemoDataset(1000);

			// Then generate another dataset with high randomness (0.99) to trigger edge cases.
			let callCount = 0;
			vi.spyOn(randomUtils, "secureRandom").mockImplementation(() => {
				callCount++;
				return 0.99;
			});
			const edgeDataset = generateDemoDataset(1000);

			// Verify solar irradiance reduction due to clouds (hour 12 is daytime)
			// rowCount = 1000 -> 1000 minutes = 16.6 hours. Hour of day starts at 0.
			// Let's check row index 720 (12 hours * 60 mins). This is definitely daytime.
			const daytimeIdx = 720;

			const baseSolarCol = baseDataset.data[3];
			const edgeSolarCol = edgeDataset.data[3];
			const baseSolarValue = baseSolarCol.data[daytimeIdx] + baseSolarCol.refPoint;
			const edgeSolarValue = edgeSolarCol.data[daytimeIdx] + edgeSolarCol.refPoint;

			// Ensure it was daytime so there was actually solar irradiance to start with
			expect(baseSolarValue).toBeGreaterThan(0);
			// Edge solar should be scaled down by 0.3 since 0.99 > 0.95
			// Because randomness contributes 0 noise to solar in the base, we can directly compare them.
			expect(edgeSolarValue).toBeCloseTo(baseSolarValue * 0.3, 1);

			// Verify wind speed peaks
			const baseWindCol = baseDataset.data[4];
			const edgeWindCol = edgeDataset.data[4];
			const baseWindValue = baseWindCol.data[daytimeIdx] + baseWindCol.refPoint;
			const edgeWindValue = edgeWindCol.data[daytimeIdx] + edgeWindCol.refPoint;

			// Base wind (0.5) is just windBase + 0.5 * 2
			// Edge wind (0.99) should trigger peak: windBase + 0.99 * 10
			// Diff is roughly 8.98
			expect(edgeWindValue).toBeGreaterThan(baseWindValue + 8);

			vi.restoreAllMocks();
		});

	describe("getDemoAppState", () => {`;

content = content.replace(targetStr, newTest);

fs.writeFileSync(file_path, content);
