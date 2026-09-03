import { Button, Badge, Row, Col } from "react-bootstrap";

import { formatName } from "../utils.js";

/**
 * EquipmentRow
 *
 * Presentational component for one line of equipment. It contains no business
 * rule: what the user is allowed to do is decided by the parent component and
 * passed here through canDecrease / canIncrease. This is what makes it reusable
 * both when creating a reservation (EquipmentSelection, inside Book) and when
 * modifying one (ReservationEdit), which apply different limits to the same row.
 *
 * INPUT (props, passed as a single object):
 * - equipment: one equipment object { id, name, minQuantity, availableQuantity }
 * - quantity: number, the quantity currently selected for this equipment
 * - canDecrease: boolean, whether the "-" button is enabled
 * - canIncrease: boolean, whether the "+" button is enabled
 * - handleQuantityChange: function(equipment, delta), updates the quantity
 * - formDisabled: boolean, true while the form is being submitted
 *
 * OUTPUT (return value):
 * - JSX: one row with the name of the equipment, its badges and the +/- controls
 */
function EquipmentRow(props) {
	const equipment = props.equipment;

	// The "min" badge is shown only for mandatory equipment. It is what explains
	// to the user why the "-" button stops at that value.
	let minBadge = null;
	if (equipment.minQuantity > 0) {
		minBadge = (
			<Badge bg="warning" text="dark" className="me-3">
				min: {equipment.minQuantity}
			</Badge>
		);
	}

	return (
		<Row className="justify-content-between align-items-center mb-2">
			{/* Left side: the name of the equipment */}
			<Col>{formatName(equipment.name)}</Col>

			{/* Right side: badges and quantity controls */}
			<Col xs="auto" className="d-flex align-items-center">
				{minBadge}
				<Badge bg="light" text="dark" className="me-3">
					available: {equipment.availableQuantity}
				</Badge>
				<Button
					size="sm"
					variant="outline-secondary"
					type="button"
					disabled={props.formDisabled || !props.canDecrease}
					onClick={() => props.handleQuantityChange(equipment, -1)}
				>
					-
				</Button>
				<span className="mx-2">{props.quantity}</span>
				<Button
					size="sm"
					variant="outline-secondary"
					type="button"
					disabled={props.formDisabled || !props.canIncrease}
					onClick={() => props.handleQuantityChange(equipment, 1)}
				>
					+
				</Button>
			</Col>
		</Row>
	);
}

export default EquipmentRow;
