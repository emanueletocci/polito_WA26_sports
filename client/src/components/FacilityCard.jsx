import { Card, Badge, Stack } from "react-bootstrap";
import { formatName } from "../utils";

function FacilityCard({ group }) {
	return (
		<Card>
			<Card.Body>
				<Stack
					direction="horizontal"
					gap={2}
					className="justify-content-between"
				>
					<Card.Title>
						{formatName(group.facilityTypeName)}
					</Card.Title>
					<Badge bg={getBadgeColor(group.free)}>
						{group.free}/{group.totalCount} free
					</Badge>
				</Stack>

				{/* Showing the available facility codes */}
				<Stack direction="horizontal" gap={2} className="flex-wrap">
					{group.freeCodes.map((code) => (
						<Badge key={code} bg="primary">
							{code}
						</Badge>
					))}
				</Stack>
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
