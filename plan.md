1. We have successfully extracted the layout calculation logic from `ChartContainer.tsx` into a new custom hook `useChartLayout` located in `src/components/Plot/useChartLayout.ts`.
2. We removed the duplicated import statements and refactored the layout calculation logic within `ChartContainer.tsx` to correctly use `useChartLayout`.
3. We have verified the changes by running `pnpm run lint` and `pnpm test`, and all tests passed.
4. The pre-commit instructions will be run and the PR will be submitted.
