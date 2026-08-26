import { Card, Badge, Stack } from "react-bootstrap";
import { useState, useEffect } from "react";
import API from "../API.js";
import { formatName } from "../utils";

function FacilityCard({ group }) {
	const [equipmentRules, setEquipmentRules] = useState([]);

	useEffect(() => {
		API.getEquipment(group.facilityTypeId)
			.then((rules) => setEquipmentRules(rules))
			.catch((err) => console.error("Error fetching equipment rules:", err));
	}, [group.facilityTypeId]);

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
				<div className="text-muted small">Mandatory equipment</div>
				<div className="mb-2">
					{mandatory.length > 0
						? mandatory
								.map((eq) => `${formatName(eq.name)} \u00D7${eq.minQuantity}`)
								.join(", ")
						: "—"}
				</div>

				{/* Optional equipment for this facility type */}
				<div className="text-muted small">Optional</div>
				<div>
					{optional.length > 0
						? optional.map((eq) => formatName(eq.name)).join(", ")
						: "—"}
				</div>
			</Card.Body>
		</Card>
	);
}

// -----------------------------------------------------------------------------
// LOCAL UTILITY FUNCTIONS
// -----------------------------------------------------------------------------

function getBadgeColor(free) {
	if (free === 0) return "secondary";
	if (free === 1) return "warning";
	return "success";
}

export default FacilityCard;
