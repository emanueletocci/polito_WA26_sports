import { Card, Badge, Stack } from "react-bootstrap";

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
						{formatFacilityTypeName(group.facilityTypeName)}
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

// Turns "table_tennis" into "Table tennis": replace underscores with spaces,
// then capitalize only the first letter.
function formatFacilityTypeName(name) {
	const withSpaces = name.replace(/_/g, " ");
	return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

function getBadgeColor(free) {
	if (free === 0) return "secondary";
	if (free === 1) return "warning";
	return "success";
}

export default FacilityCard;
