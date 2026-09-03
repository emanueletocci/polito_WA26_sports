import { Card, Button, Badge, Row, Col } from "react-bootstrap";

import { formatName } from "../utils.js";

/**
 * EquipmentRow
 *
 * Presentational component for one line of equipment. It contains no business
 * rule.
 *
 * INPUT (props, passed as a single object):
 * - equipment: one equipment object { id, name, minQuantity, availableQuantity }
 * - quantity: number, the quantity currently selected for this equipment
 * - canDecrease: boolean, whether the "-" button is enabled (ignored if readOnly)
 * - canIncrease: boolean, whether the "+" button is enabled (ignored if readOnly)
 * - handleQuantityChange: function(equipment, delta), updates the quantity
 * - formDisabled: boolean, true while the form is being submitted
 * - readOnly: boolean, when true no button is shown and the quantity cannot be
 *   changed at all (used for the mandatory equipment of an existing reservation)
 * - readOnlyLabel: string, the text of the badge shown instead of the buttons
 *   when readOnly is true
 *
 * OUTPUT (return value):
 * - JSX: one row with the name of the equipment, its badges, and either the
 *   +/- controls or the fixed quantity
 */
function EquipmentRow(props) {
	const equipment = props.equipment;

	// The "min" badge is shown only for mandatory equipment.
	let minBadge = null;
	if (equipment.minQuantity > 0) {
		minBadge = (
			<Badge bg="warning" text="dark" className="me-3">
				min: {equipment.minQuantity}
			</Badge>
		);
	}

	// Right-hand side: either the fixed quantity, or the +/- controls.
	// It is computed here, with a standard if/else, instead of a ternary in the JSX.
	let quantityControls;
	if (props.readOnly) {
		quantityControls = (
			<>
				<Badge bg="secondary" className="me-3">
					{props.readOnlyLabel}
				</Badge>
				<span>{props.quantity}</span>
			</>
		);
	} else {
		quantityControls = (
			<>
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
			</>
		);
	}

	return (
		<Row className="justify-content-between align-items-center mb-2">
			{/* Left side: the name of the equipment */}
			<Col>{formatName(equipment.name)}</Col>

			{/* Right side: badges and quantity */}
			<Col xs="auto" className="d-flex align-items-center">
				{minBadge}
				<Badge bg="light" text="dark" className="me-3">
					available: {equipment.availableQuantity}
				</Badge>
				{quantityControls}
			</Col>
		</Row>
	);
}

/**
 * EquipmentSelection
 *
 * The "Equipment" card used when creating a new reservation: it applies the
 * booking rules (the mandatory minimum is always included and can never be
 * removed; extra and optional items are allowed only if the score is not
 * negative) and delegates the rendering of every line to EquipmentRow.
 *
 * INPUT (props, passed as a single object):
 * - equipmentRules: array of the equipment objects of the selected facility type
 * - quantities: object mapping equipment id -> currently selected quantity
 * - canRequestExtra: boolean, false when the user's score is negative (in that
 *   case only the mandatory minimum quantities can be requested)
 * - handleQuantityChange: function(equipment, delta), updates a quantity
 * - formDisabled: boolean, true while the form is being submitted
 *
 * OUTPUT (return value):
 * - JSX: a Card with the "Mandatory" and "Optional" sections
 */
function EquipmentSelection(props) {
	// Split the rules into mandatory (minQuantity > 0) and optional ones.
	const mandatory = props.equipmentRules.filter((eq) => eq.minQuantity > 0);
	const optional = props.equipmentRules.filter((eq) => eq.minQuantity === 0);

	// -------------------------------------------------------------------------
	// MANDATORY SECTION
	// -------------------------------------------------------------------------

	// "-" is enabled only above the minimum, "+" only if extra items are allowed
	// and there is still something available.
	let mandatoryContent;
	if (mandatory.length === 0) {
		mandatoryContent = <p className="text-muted">N/A</p>;
	} else {
		mandatoryContent = mandatory.map((eq) => (
			<EquipmentRow
				key={eq.id}
				equipment={eq}
				quantity={props.quantities[eq.id]}
				canDecrease={props.quantities[eq.id] > eq.minQuantity}
				canIncrease={
					props.canRequestExtra &&
					props.quantities[eq.id] < eq.availableQuantity
				}
				handleQuantityChange={props.handleQuantityChange}
				formDisabled={props.formDisabled}
			/>
		));
	}

	// -------------------------------------------------------------------------
	// OPTIONAL SECTION
	// -------------------------------------------------------------------------

	let optionalContent;
	if (optional.length === 0) {
		optionalContent = <p className="text-muted">N/A</p>;
	} else {
		optionalContent = optional.map((eq) => (
			<EquipmentRow
				key={eq.id}
				equipment={eq}
				quantity={props.quantities[eq.id]}
				canDecrease={props.quantities[eq.id] > 0}
				canIncrease={
					props.canRequestExtra &&
					props.quantities[eq.id] < eq.availableQuantity
				}
				handleQuantityChange={props.handleQuantityChange}
				formDisabled={props.formDisabled}
			/>
		));
	}

	return (
		<Card className="p-3 mb-4">
			<h2 className="h5">Equipment</h2>
			<p className="text-muted small mb-3">
				Use the + and - buttons to adjust the quantity of each item.
			</p>

			<hr />

			<p className="text-muted small mb-2">
				Mandatory — the minimum quantity is always included
			</p>
			{mandatoryContent}

			<p className="text-muted small mb-2 mt-3">Optional</p>
			{optionalContent}
		</Card>
	);
}

export default EquipmentSelection;
export { EquipmentRow };
