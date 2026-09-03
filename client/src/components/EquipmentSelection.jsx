import { Card } from "react-bootstrap";

import EquipmentRow from "./EquipmentRow.jsx";

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
