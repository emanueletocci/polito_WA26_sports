import { Card, Badge, Stack } from "react-bootstrap";

import { formatName } from "../utils.js";

/**
 * FacilityCard
 *
 * Presentational component: it performs no request of its own. The
 * equipment of this facility type is fetched once by Home, together with the
 * whole list, and passed here already filtered.
 *
 * INPUT (props, passed as a single object):
 * - group: object describing one group of facilities of the same type:
 *     {
 *       facilityTypeId,      // id of the facility type
 *       facilityTypeName,    // name of the facility type
 *       free,                // how many facilities of this type are free
 *       totalCount,          // how many facilities of this type exist
 *       freeCodes,           // codes of the free facilities, e.g. ["T2", "T3"]
 *     }
 * - equipmentRules: array of the equipment of this facility type, i.e.
 *   [{ id, name, minQuantity, availableQuantity, totalQuantity }, ...]
 *
 * OUTPUT (return value):
 * - JSX: a Card with the name of the facility type, a badge with the free/total
 *   count, the codes of the free facilities, and the mandatory and optional
 *   equipment of this type
 */
function FacilityCard(props) {
	const group = props.group;

	// Split the equipment into mandatory (minQuantity > 0) and optional ones.
	const mandatory = props.equipmentRules.filter((eq) => eq.minQuantity > 0);
	const optional = props.equipmentRules.filter((eq) => eq.minQuantity === 0);

	// -------------------------------------------------------------------------
	// MANDATORY EQUIPMENT
	// -------------------------------------------------------------------------
	// With at least one item a single string like "Tennis Racket x2, Tennis Ball x3"
	// is built, otherwise a placeholder is shown.
	let mandatoryText;
	if (mandatory.length > 0) {
		mandatoryText = mandatory
			.map((eq) => `${formatName(eq.name)} \u00D7${eq.minQuantity}`)
			.join(", ");
	} else {
		mandatoryText = "N/A";
	}

	// -------------------------------------------------------------------------
	// OPTIONAL EQUIPMENT
	// -------------------------------------------------------------------------
	let optionalText;
	if (optional.length > 0) {
		optionalText = optional.map((eq) => formatName(eq.name)).join(", ");
	} else {
		optionalText = "N/A";
	}

	// -------------------------------------------------------------------------
	// FREE FACILITIES
	// -------------------------------------------------------------------------
	let freeCodesContent;
	if (group.freeCodes.length > 0) {
		freeCodesContent = group.freeCodes.map((code) => (
			<Badge key={code} bg="primary">
				{code}
			</Badge>
		));
	} else {
		freeCodesContent = (
			<span className="text-muted small">No facility available</span>
		);
	}

	return (
		<Card>
			<Card.Body>
				<Stack
					direction="horizontal"
					gap={2}
					className="justify-content-between"
				>
					<Card.Title>{formatName(group.facilityTypeName)}</Card.Title>
					{/* The colour of the badge depends on how many facilities are free */}
					<Badge bg={getBadgeColor(group.free)}>
						{group.free}/{group.totalCount} free
					</Badge>
				</Stack>

				{/* Codes of the facilities that can still be booked */}
				<Stack direction="horizontal" gap={2} className="flex-wrap mb-3">
					{freeCodesContent}
				</Stack>

				{/* Mandatory equipment, with the minimum quantity required */}
				<p className="text-muted small mb-1">Mandatory equipment</p>
				<p className="mb-2">{mandatoryText}</p>

				{/* Optional equipment */}
				<p className="text-muted small mb-1">Optional</p>
				<p className="mb-0">{optionalText}</p>
			</Card.Body>
		</Card>
	);
}

/**
 * getBadgeColor
 *
 * INPUT (params, positional):
 * - free: number, how many facilities of this type are currently free
 *
 * OUTPUT (return value):
 * - string: the name of a react-bootstrap variant, used as the background of
 *   the badge:
 *   - "danger" (red) if none is free
 *   - "warning" (yellow) if exactly one is free
 *   - "success" (green) if two or more are free
 */
function getBadgeColor(free) {
	if (free === 0) return "danger";
	if (free === 1) return "warning";
	return "success";
}

export default FacilityCard;
