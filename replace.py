import re

with open('src/components/Plot/Crosshair.tsx', 'r') as f:
    content = f.read()

# Replace tooltip rendering loop to use DOM recycling
search_str = """		const renderTooltipHTML = useCallback(
			(snap: SnapResult | null, pos: { x: number; y: number } | null) => {
				const tooltip = tooltipRef.current;
				if (!tooltip) return;
				if (!snap || !pos || isPanning) {
					tooltip.style.display = "none";
					return;
				}
				tooltip.style.display = "";
				tooltip.style.left = `${pos.x + 12}px`;
				tooltip.style.top = `${pos.y + 15}px`;

				const multi = snap.entries.length > 1;
				tooltip.replaceChildren();

				snap.entries.forEach((group, gIdx) => {
					const groupDiv = document.createElement("div");
					groupDiv.style.color = tooltipSubColor;
					groupDiv.style.fontSize = "9px";
					if (gIdx > 0) {
						groupDiv.style.borderTop = `1px solid ${tooltipDividerColor}`;
						groupDiv.style.paddingTop = "4px";
						groupDiv.style.marginTop = "4px";
					}

					const labelSpan = document.createElement("span");
					labelSpan.className = "chart-tooltip-x-label";
					labelSpan.style.color = tooltipColor;

					let labelText = "";
					if (multi) labelText += `${group.xAxisName}: `;
					labelText += group.xLabel;
					labelSpan.textContent = labelText;
					groupDiv.appendChild(labelSpan);
					tooltip.appendChild(groupDiv);

					const itemsDiv = document.createElement("div");
					itemsDiv.className = "chart-tooltip-items";

					for (const item of group.items) {
						const formatted =
							item.valueLabel ??
							parseFloat(item.value.toPrecision(7)).toLocaleString();
						const sepIdx = formatted.search(/[.,]/);
						const intPart =
							sepIdx === -1 ? formatted : formatted.slice(0, sepIdx);
						const decPart = sepIdx === -1 ? "" : formatted.slice(sepIdx);

						const itemLabelSpan = document.createElement("span");
						itemLabelSpan.className = "chart-tooltip-item-label";
						itemLabelSpan.style.color = item.color;
						itemLabelSpan.textContent = `${item.label}:`;
						itemsDiv.appendChild(itemLabelSpan);

						const intPartSpan = document.createElement("span");
						intPartSpan.className = "chart-tooltip-value-int";
						intPartSpan.style.color = tooltipColor;
						intPartSpan.textContent = intPart;
						itemsDiv.appendChild(intPartSpan);

						const decPartSpan = document.createElement("span");
						decPartSpan.className = "chart-tooltip-value-dec";
						decPartSpan.style.color = tooltipColor;
						decPartSpan.textContent = decPart;
						itemsDiv.appendChild(decPartSpan);
					}
					tooltip.appendChild(itemsDiv);
				});
			},
			[isPanning, tooltipColor, tooltipDividerColor, tooltipSubColor],
		);"""

replace_str = """		const renderTooltipHTML = useCallback(
			(snap: SnapResult | null, pos: { x: number; y: number } | null) => {
				const tooltip = tooltipRef.current;
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
						const intPart = sepIdx === -1 ? formatted : formatted.slice(0, sepIdx);
						const decPart = sepIdx === -1 ? "" : formatted.slice(sepIdx);

						if (!itemNode) {
							itemNode = document.createElement("div");
							itemNode.className = "chart-tooltip-item-row";
							itemNode.style.display = "contents"; // to let grid/flex work from parent if needed, or just normal block

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

						itemNode.style.display = "";
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
						itemNode.style.display = "none";
						itemNode = itemNode.nextElementSibling as HTMLElement | null;
					}

					groupNode = groupNode.nextElementSibling as HTMLElement | null;
				}

				// Hide remaining unused groups
				while (groupNode) {
					groupNode.style.display = "none";
					groupNode = groupNode.nextElementSibling as HTMLElement | null;
				}
			},
			[isPanning, tooltipColor, tooltipDividerColor, tooltipSubColor],
		);"""

if search_str in content:
    content = content.replace(search_str, replace_str)
    with open('src/components/Plot/Crosshair.tsx', 'w') as f:
        f.write(content)
    print("Successfully replaced.")
else:
    print("Could not find string.")
