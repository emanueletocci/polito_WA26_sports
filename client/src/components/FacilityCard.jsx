import { Card, Badge, Stack } from "react-bootstrap";

function FacilityCard({ group }) {
	return (
		<Card>
			<Stack direction="horizontal" gap={2} className="justify-content-between">
				<Card.Title>{group.facilityTypeName}</Card.Title>
				<Badge bg="secondary">
					{group.free}/{group.totalCount}
				</Badge>
			</Stack>
		</Card>
	);
}

export default FacilityCard;
