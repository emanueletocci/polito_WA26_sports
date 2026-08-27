import { Card, Badge, Stack } from "react-bootstrap";
import { useState, useEffect } from "react";
import API from "../API.js";
import { formatName } from "../utils";

/**
 * FacilityCard
 *
 * INPUT (props):
 * - group: object describing one facility-type group, shaped like:
 *     {
 *       facilityTypeId,      // id used to fetch the equipment rules for this type
 *       facilityTypeName,    // display name of the facility type
 *       free,                // number of currently free facilities of this type
 *       totalCount,          // total number of facilities of this type
 *       freeCodes,           // array of codes of the free facilities, e.g. ["A1", "A2"]
 *     }
 *
 * OUTPUT (return value):
 * - a Card showing the facility type name, a badge with free/total count,
 *   the codes of the free facilities, and the mandatory/optional equipment for
 *   this facility type
 */
function FacilityCard({ group }) {
	// equipmentRules: the list of equipment rules for this specific facility type,
	const [equipmentRules, setEquipmentRules] = useState([]);

	// Fetch the equipment rules whenever the facility type id changes
	// (in practice, this runs once per card, since each card has its own group).
	useEffect(() => {
		API.getEquipment(group.facilityTypeId)
			.then((rules) => setEquipmentRules(rules))
			.catch((err) => console.error("Error fetching equipment rules:", err));
	}, [group.facilityTypeId]);

	// Split the equipment rules into two groups: mandatory (minQuantity > 0)
	// and optional (minQuantity === 0).
	const mandatory = equipmentRules.filter((eq) => eq.minQuantity > 0);
	const optional = equipmentRules.filter((eq) => eq.minQuantity === 0);

	return (
		<Card>
			<Card.Body>
				<Stack
					direction="horizontal"
					gap={2}
					className="justify-content-between"
				>
					<Card.Title>{formatName(group.facilityTypeName)}</Card.Title>
					{/* Badge color depends on how many facilities are still free */}
					<Badge bg={getBadgeColor(group.free)}>
						{group.free}/{group.totalCount} free
					</Badge>
				</Stack>

				{/* Showing the available facility codes */}
				<Stack direction="horizontal" gap={2} className="flex-wrap mb-3">
					{group.freeCodes.map((code) => (
						<Badge key={code} bg="primary">
							{code}
						</Badge>
					))}
				</Stack>

				{/* Mandatory equipment for this facility type, with the minimum quantity required */}
				<p className="text-muted small">Mandatory equipment</p>
				<p className="mb-2">
					{/*
						If there is at least one mandatory item, build a single string like
						"Ball ×2, Net ×1".
						Otherwise, show "N/A" as a placeholder for "nothing to show".
					*/}
					{mandatory.length > 0
						? mandatory
								.map((eq) => `${formatName(eq.name)} \u00D7${eq.minQuantity}`)
								.join(", ")
						: "—"}
				</p>

				{/* Optional equipment for this facility type */}
				<p className="text-muted small">Optional</p>
				<p>
					{optional.length > 0
						? optional.map((eq) => formatName(eq.name)).join(", ")
						: "N/A"}
				</p>
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
 * - string: a react-bootstrap variant name used for the Badge background
 *   - "danger" (red) if none are free
 *   - "warning" (yellow) if exactly one is free
 *   - "success" (green) if two or more are free
 */
function getBadgeColor(free) {
	if (free === 0) return "danger";
	if (free === 1) return "warning";
	return "success";
}

export default FacilityCard;
