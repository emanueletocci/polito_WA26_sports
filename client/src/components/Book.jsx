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
 * INPUT (params, positional):
 * - rules: array of equipment objects, e.g. [{ id, minQuantity, availableQuantity }, ...]
 *
 * OUTPUT (return value):
 * - object mapping equipment id -> starting quantity: mandatory items start at
 *   their minimum required quantity, optional items start at 0. This is also
 *   exactly what a user with a negative score is allowed to request.
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
 * INPUT (params, positional):
 * - rules: array of equipment objects of the selected facility type
 *
 * OUTPUT (return value):
 * - array of the mandatory equipment whose minimum required quantity exceeds the
 *   quantity currently available. When it is not empty the facility cannot be
 *   booked at all, as required by the specification ("when it is known that not
 *   enough equipment is available, booking the facility must not be allowed").
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

	// The props used inside the effects are destructured here, and not read as
	// props.something inside them: this way every effect declares exactly which
	// value it depends on, instead of depending on the whole props object (which
	// changes identity at every render of the parent).
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
	// NB: this is only a convenience for the user. The rule is enforced by the
	// server, which is the only place where it can actually be trusted.
	const canRequestExtra = user.score >= 0;

	// ---- Effect 1: load the list of facility types, once, when the page mounts ----
	// The empty dependency array means: run only after the first render.
	useEffect(() => {
		API.getFacilityTypes()
			.then((types) => setFacilityTypes(types))
			.catch((err) => handleErrors(err));
		// handleErrors is deliberately NOT listed among the dependencies: it is
		// re-created at every render of App, so listing it would make this fetch
		// run again at every render of the parent. Its behaviour never changes
		// (it only calls setMessage), so the captured version is always equivalent.
	}, []);

	// ---- Effect 2: react to a change of the selected facility type ----
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
		// Only selectedTypeId is listed: handleErrors is omitted on purpose, see
		// the note on the first effect above.
	}, [selectedTypeId]);

	/**
	 * handleQuantityChange
	 *
	 * INPUT (params, positional):
	 * - equipment: the equipment object whose quantity is being changed
	 *   (it must have id, minQuantity, availableQuantity)
	 * - delta: number, how much to add to the current quantity (+1 or -1)
	 *
	 * OUTPUT (return value):
	 * - none (undefined). Its job is a SIDE EFFECT: it updates the "quantities"
	 *   state, keeping the value between the minimum required and the quantity
	 *   currently available.
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

	// ---- Mandatory equipment that cannot be satisfied ----
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

	// ---- Warning for users with a negative score ----
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

	// ---- The equipment card makes sense only after a type has been chosen ----
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

	// ---- When is the reservation ready to be sent? ----
	// A type must be chosen, in manual mode also a facility, and the mandatory
	// equipment must be available.
	let canSubmit = true;
	if (!selectedTypeId) canSubmit = false;
	if (mode === "manual" && !selectedFacilityCode) canSubmit = false;
	if (unavailableMandatory.length > 0) canSubmit = false;

	// ---- Label of the submit button ----
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
