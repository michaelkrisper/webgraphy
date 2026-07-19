import type { SnapResult } from "./types";

interface RenderTooltipHTMLParams {
	tooltip: HTMLDivElement | null;
	snap: SnapResult | null;
	pos: { x: number; y: number } | null;
	isPanning: boolean;
	tooltipSubColor: string;
	tooltipDividerColor: string;
	tooltipColor: string;
}

export function renderTooltipHTML({
	tooltip,
	snap,
	pos,
	isPanning,
	tooltipSubColor,
	tooltipDividerColor,
	tooltipColor,
}: RenderTooltipHTMLParams) {
	if (!tooltip) return;
	if (!snap || !pos || isPanning) {
		tooltip.style.display = "none";
		return;
	}
	tooltip.style.display = "";
	tooltip.style.left = `${pos.x + 12}px`;
	tooltip.style.top = `${pos.y + 15}px`;

	const multi = snap.entries.length > 1;

	// DOM node recycling
	let groupNode = tooltip.firstElementChild as HTMLElement | null;
	for (let gIdx = 0; gIdx < snap.entries.length; gIdx++) {
		const group = snap.entries[gIdx];

		if (!groupNode) {
			groupNode = document.createElement("div");
			tooltip.appendChild(groupNode);
		}

		groupNode.style.display = "";
		groupNode.style.color = tooltipSubColor;
		groupNode.style.fontSize = "9px";
		if (gIdx > 0) {
			groupNode.style.borderTop = `1px solid ${tooltipDividerColor}`;
			groupNode.style.paddingTop = "4px";
			groupNode.style.marginTop = "4px";
		} else {
			groupNode.style.borderTop = "";
			groupNode.style.paddingTop = "";
			groupNode.style.marginTop = "";
		}

		let labelSpan = groupNode.firstElementChild as HTMLElement | null;
		let itemsDiv = groupNode.lastElementChild as HTMLElement | null;

		if (!labelSpan || labelSpan === itemsDiv) {
			labelSpan = document.createElement("span");
			labelSpan.className = "chart-tooltip-x-label";
			groupNode.insertBefore(labelSpan, groupNode.firstChild);
		}
		if (!itemsDiv || itemsDiv === labelSpan) {
			itemsDiv = document.createElement("div");
			itemsDiv.className = "chart-tooltip-items";
			groupNode.appendChild(itemsDiv);
		}

		labelSpan.style.color = tooltipColor;
		let labelText = "";
		if (multi) labelText += `${group.xAxisName}: `;
		labelText += group.xLabel;
		labelSpan.textContent = labelText;

		let itemNode = itemsDiv.firstElementChild as HTMLElement | null;
		for (let iIdx = 0; iIdx < group.items.length; iIdx++) {
			const item = group.items[iIdx];
			const formatted =
				item.valueLabel ??
				parseFloat(item.value.toPrecision(7)).toLocaleString();
			const sepIdx = formatted.search(/[.,]/);
			const intPart =
				sepIdx === -1 ? formatted : formatted.slice(0, sepIdx);
			const decPart = sepIdx === -1 ? "" : formatted.slice(sepIdx);

			if (!itemNode) {
				itemNode = document.createElement("div");
				itemNode.className = "chart-tooltip-item-row";

				const itemLabelSpan = document.createElement("span");
				itemLabelSpan.className = "chart-tooltip-item-label";
				itemNode.appendChild(itemLabelSpan);

				const intPartSpan = document.createElement("span");
				intPartSpan.className = "chart-tooltip-value-int";
				itemNode.appendChild(intPartSpan);

				const decPartSpan = document.createElement("span");
				decPartSpan.className = "chart-tooltip-value-dec";
				itemNode.appendChild(decPartSpan);

				itemsDiv.appendChild(itemNode);
			}

			itemNode.hidden = false;
			const itemLabelSpan = itemNode.children[0] as HTMLElement;
			const intPartSpan = itemNode.children[1] as HTMLElement;
			const decPartSpan = itemNode.children[2] as HTMLElement;

			itemLabelSpan.style.color = item.color;
			itemLabelSpan.textContent = `${item.label}:`;

			intPartSpan.style.color = tooltipColor;
			intPartSpan.textContent = intPart;

			decPartSpan.style.color = tooltipColor;
			decPartSpan.textContent = decPart;

			itemNode = itemNode.nextElementSibling as HTMLElement | null;
		}

		// Hide remaining unused items in this group
		while (itemNode) {
			itemNode.hidden = true;
			itemNode = itemNode.nextElementSibling as HTMLElement | null;
		}

		groupNode = groupNode.nextElementSibling as HTMLElement | null;
	}

	// Hide remaining unused groups
	while (groupNode) {
		groupNode.style.display = "none";
		groupNode = groupNode.nextElementSibling as HTMLElement | null;
	}
}
