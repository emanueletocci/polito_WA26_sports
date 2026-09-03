import { useState, useEffect } from "react";
import { Container, Form, Button, Alert } from "react-bootstrap";
import { useNavigate } from "react-router";

import API from "../API.js";
import { formatName } from "../utils.js";
// The two cards of the form are separate components. The equipment one is
// shared with the page that modifies an existing reservation (both reuse
// EquipmentRow).
import FacilitySelection from "./FacilitySelection.jsx";
import EquipmentSelection from "./EquipmentSelection.jsx";

// -----------------------------------------------------------------------------
// LOCAL HELPER FUNCTIONS
// -----------------------------------------------------------------------------

/**
 * buildInitialQuantities
 *
 * Builds the starting value of the "quantities" state when a facility type is
 * selected: every mandatory item starts already at its minimum (so the form
 * shows a bookable reservation immediately, with nothing missing), and every
 * optional item starts at 0 (nothing extra is assumed).
 *
 * These starting values are not just a convenient default: they are exactly the
 * maximum a user with a negative score is allowed to submit. So for that user
 * this object is also the final one, since every "+" button stays disabled and
 * nothing above it can ever be reached.
 *
 * INPUT (params):
 * - rules: array of equipment objects, e.g. [{ id, minQuantity, availableQuantity }, ...]
 *
 * OUTPUT (return value):
 * - object mapping equipment id -> starting quantity, e.g. { 1: 2, 2: 3, 3: 0 }
 *   for tennis (2 rackets and 3 balls required, the towel optional)
 */
function buildInitialQuantities(rules) {
	const quantities = {};
	rules.forEach((eq) => {
		// Standard if/else instead of a ternary, to decide the starting quantity.
		if (eq.minQuantity > 0) {
			quantities[eq.id] = eq.minQuantity;
		} else {
			quantities[eq.id] = 0;
		}
	});
	return quantities;
}

/**
 * findUnavailableMandatory
 *
 * Checks whether a facility of the selected type can be booked at all. A
 * reservation always includes the mandatory minimum quantities, so if the sport
 * center does not have enough units left of even one mandatory item, no
 * reservation of that type is possible: the user must be told the reason and
 * the form must be locked.
 *
 * The two conditions of the filter are both needed:
 *  - minQuantity > 0 keeps only the mandatory items, since a missing optional
 *    one does not prevent the booking;
 *  - minQuantity > availableQuantity is the actual shortage, e.g. soccer needs
 *    10 pairs of shoes and only 6 are free.
 *
 * INPUT (params):
 * - rules: array of equipment objects of the selected facility type
 *
 * OUTPUT (return value):
 * - array of the mandatory equipment that cannot be satisfied. Empty means the
 *   type can be booked. Book uses the names in it to build the error message,
 *   which is why the objects are returned instead of a plain boolean.
 */
function findUnavailableMandatory(rules) {
	return rules.filter(
		(eq) => eq.minQuantity > 0 && eq.minQuantity > eq.availableQuantity,
	);
}

// -----------------------------------------------------------------------------
// MAIN COMPONENT
// -----------------------------------------------------------------------------

/**
 * Book
 *
 * INPUT (props, passed as a single object):
 * - user: object, the currently logged-in user (user.score decides whether extra
 *   equipment may be requested)
 * - showSuccess: function(text), shows a confirmation message to the user
 * - handleErrors: function(err), shows the reason of a failed operation
 *
 * OUTPUT (return value):
 * - JSX: the "New reservation" page, with the facility card, the equipment card
 *   (once a type has been selected) and the confirm/cancel buttons
 */
function Book(props) {
	const navigate = useNavigate();
	const { user, showSuccess, handleErrors } = props;

	const [facilityTypes, setFacilityTypes] = useState([]);
	const [selectedTypeId, setSelectedTypeId] = useState("");

	const [mode, setMode] = useState("manual"); // "manual" | "automatic"
	const [freeFacilities, setFreeFacilities] = useState([]);
	const [selectedFacilityCode, setSelectedFacilityCode] = useState("");

	const [equipmentRules, setEquipmentRules] = useState([]);
	const [quantities, setQuantities] = useState({});

	const [formDisabled, setFormDisabled] = useState(false);

	// A negative score means the user may only book with the mandatory minimum
	// quantities: no optional equipment and no extra mandatory units.

	const canRequestExtra = user.score >= 0;

	// Loading the list of facility
	useEffect(() => {
		API.getFacilityTypes()
			.then((types) => setFacilityTypes(types))
			.catch((err) => handleErrors(err));
	}, []);

	// react to a change of the selected facility type
	// It runs again every time selectedTypeId changes. All the actions below are
	// consequences of the SAME event (the user picked a different type), so they
	// live in a single effect instead of several ones with the same dependency.
	useEffect(() => {
		// Reset the choices that no longer make sense for the new type.
		setSelectedFacilityCode("");

		// No type selected (e.g. the user reset the dropdown): clear everything,
		// there is nothing to fetch.
		if (!selectedTypeId) {
			setFreeFacilities([]);
			setEquipmentRules([]);
			setQuantities({});
			return;
		}

		// Free facilities of every type are requested, then only those of the
		// selected type are kept: the filtering by status is done by the server,
		// the (trivial) filtering by type on the already received data.
		API.getFacilities("free")
			.then((facilities) => {
				const filtered = facilities.filter(
					(f) => f.facilityTypeId === Number(selectedTypeId),
				);
				setFreeFacilities(filtered);
			})
			.catch((err) => handleErrors(err));

		// Equipment rules of the selected type, with the initial quantities.
		API.getEquipment(Number(selectedTypeId))
			.then((rules) => {
				setEquipmentRules(rules);
				setQuantities(buildInitialQuantities(rules));
			})
			.catch((err) => handleErrors(err));
	}, [selectedTypeId]);

	/**
	 * handleQuantityChange
	 *
	 * Called when the user clicks the "+" or "-" button of one equipment row: it
	 * adds delta to the quantity currently selected for that item and saves the
	 * new value in the "quantities" state, so that the row re-renders with the
	 * updated number.
	 *
	 * The new value is clamped between two limits:
	 *  - the lower one is minQuantity, which is the mandatory minimum of this
	 *    facility type (0 for optional equipment, so those can go down to none);
	 *  - the upper one is availableQuantity, what is free in the sport center
	 *    right now. This reservation does not exist yet, so it holds no unit and
	 *    there is nothing to add back (unlike ReservationEdit, where the units
	 *    already rented must be counted in).
	 * INPUT (params):
	 * - equipment: the equipment object whose quantity is being changed
	 *   (it must have id, minQuantity, availableQuantity)
	 * - delta: number, how much to add to the current quantity (+1 or -1)
	 *
	 * OUTPUT: none (the "quantities" state is updated)
	 */
	const handleQuantityChange = (equipment, delta) => {
		setQuantities((prev) => {
			// prev = the quantities object as it is right now, before this update,
			// for example { 1: 2, 2: 3, 3: 0 }
			const current = prev[equipment.id];
			let next = current + delta;

			// Never below the mandatory minimum (0 for optional equipment).
			if (next < equipment.minQuantity) next = equipment.minQuantity;

			// Never above what is currently available.
			if (next > equipment.availableQuantity)
				next = equipment.availableQuantity;

			// A copy of the whole object is created, so prev is never modified
			// (React state must always be treated as immutable).
			const updated = { ...prev };
			updated[equipment.id] = next;
			return updated;
		});
	};

	/**
	 * handleSubmit
	 *
	 * INPUT (params, positional):
	 * - event: the (synthetic) form submit event
	 *
	 * OUTPUT (return value):
	 * - none (undefined). Its job is a SIDE EFFECT: it builds the reservation
	 *   object, sends it to the server and, depending on the outcome, shows a
	 *   confirmation and moves to the reservations page, or shows the error.
	 */
	const handleSubmit = (event) => {
		// Prevent the browser's default behaviour (a full page reload on submit).
		event.preventDefault();

		// Keep only the equipment with a quantity greater than 0, reshaping every
		// entry into { equipmentId, quantity }.
		const equipment = Object.entries(quantities)
			.filter(([, quantity]) => quantity > 0)
			.map(([equipmentId, quantity]) => ({
				equipmentId: Number(equipmentId),
				quantity: quantity,
			}));

		const reservation = {
			facilityTypeId: Number(selectedTypeId),
			equipment: equipment,
		};
		// In automatic mode no code is sent: the server picks a free facility.
		if (mode === "manual") {
			reservation.facilityCode = selectedFacilityCode;
		}

		setFormDisabled(true);
		API.createReservation(reservation)
			.then((created) => {
				showSuccess(
					`Reservation confirmed: ${formatName(created.facilityTypeName)} ${created.facilityCode}.`,
				);
				navigate("/reservations");
			})
			.catch((err) => handleErrors(err))
			.finally(() => setFormDisabled(false));
	};

	// Mandatory equipment that cannot be satisfied
	// When the sport center does not have enough mandatory equipment left, the
	// facility cannot be booked at all: the reason is shown and the form is locked.
	const unavailableMandatory = findUnavailableMandatory(equipmentRules);

	let unavailableAlert = null;
	if (unavailableMandatory.length > 0) {
		const names = unavailableMandatory
			.map((eq) => formatName(eq.name))
			.join(", ");
		unavailableAlert = (
			<Alert variant="danger">
				There is not enough mandatory equipment ({names}) to book a facility of
				this type right now.
			</Alert>
		);
	}

	// Warning for users with a negative score
	let negativeScoreAlert = null;
	if (!canRequestExtra) {
		negativeScoreAlert = (
			<Alert variant="warning">
				Your score is negative: you can book only with the minimum required
				equipment, without optional or extra items. Logging in again with the
				2FA code brings your score back to zero.
			</Alert>
		);
	}

	// The equipment card makes sense only after a type has been chosen
	let equipmentCard = null;
	if (selectedTypeId) {
		equipmentCard = (
			<EquipmentSelection
				equipmentRules={equipmentRules}
				quantities={quantities}
				canRequestExtra={canRequestExtra}
				handleQuantityChange={handleQuantityChange}
				formDisabled={formDisabled}
			/>
		);
	}

	// When is the reservation ready to be sent?
	// A type must be chosen, in manual mode also a facility, and the mandatory
	// equipment must be available.
	let canSubmit = true;
	if (!selectedTypeId) canSubmit = false;
	if (mode === "manual" && !selectedFacilityCode) canSubmit = false;
	if (unavailableMandatory.length > 0) canSubmit = false;

	//  Label of the submit button
	let submitLabel;
	if (formDisabled) {
		submitLabel = "Saving...";
	} else {
		submitLabel = "Confirm reservation";
	}

	return (
		<Container fluid className="py-4">
			<h1 className="mb-4">New reservation</h1>

			{negativeScoreAlert}

			<Form onSubmit={handleSubmit}>
				<FacilitySelection
					facilityTypes={facilityTypes}
					selectedTypeId={selectedTypeId}
					setSelectedTypeId={setSelectedTypeId}
					mode={mode}
					setMode={setMode}
					freeFacilities={freeFacilities}
					selectedFacilityCode={selectedFacilityCode}
					setSelectedFacilityCode={setSelectedFacilityCode}
					formDisabled={formDisabled}
				/>

				{unavailableAlert}
				{equipmentCard}

				<Button
					type="submit"
					variant="success"
					disabled={!canSubmit || formDisabled}
				>
					{submitLabel}
				</Button>
				<Button
					variant="secondary"
					type="button"
					onClick={() => navigate("/reservations")}
					disabled={formDisabled}
					className="ms-2"
				>
					Cancel
				</Button>
			</Form>
		</Container>
	);
}

export default Book;
