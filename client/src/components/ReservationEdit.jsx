import { useState, useEffect } from "react";
import { Container, Card, Button, Alert, Spinner } from "react-bootstrap";
import { useNavigate, useParams } from "react-router";

import API from "../API.js";
import { formatName } from "../utils.js";
import EquipmentRow from "./EquipmentRow.jsx";

/**
 * INPUT (props, passed as a single object):
 * - user: object, the currently logged-in user (user.score decides whether
 *   equipment may be added)
 * - showSuccess: function(text), shows a confirmation message to the user
 * - handleErrors: function(err), shows the reason of a failed operation
 *
 * OUTPUT (return value):
 * - JSX: the page that modifies the equipment of one existing reservation,
 *   identified by the ":reservationId" parameter of the URL
 *
 * Rules applied here (the server enforces them again):
 * - every equipment type may be increased or decreased, but a mandatory type
 *   can never go below its minimum quantity, and an optional one never below 0;
 * - the upper limit is what is free in the sport center plus the units already
 *   held by this reservation;
 * - a user with a negative score may only decrease quantities.
 */
function ReservationEdit(props) {
	// reservationId comes from the URL, e.g. "/reservations/12/edit" -> "12"
	const { reservationId } = useParams();
	const navigate = useNavigate();

	// destructuring the props for easier access
	const { user, showSuccess, handleErrors } = props;

	// reservation: the reservation being modified, as loaded from the server
	// (null while it is still loading, or if it could not be loaded at all)
	const [reservation, setReservation] = useState(null);

	// equipmentRules: all the equipment (mandatory and optional) of this
	// reservation's facility type, e.g. [{ id, name, minQuantity, availableQuantity }, ...]
	const [equipmentRules, setEquipmentRules] = useState([]);

	// quantities: equipment id -> currently selected quantity (editable)
	const [quantities, setQuantities] = useState({});

	const [initialQuantities, setInitialQuantities] = useState({});

	// waiting: true while the first fetch is running, so that the page is not
	// rendered before the reservation and its rules have arrived.
	const [waiting, setWaiting] = useState(true);
	const [formDisabled, setFormDisabled] = useState(false);

	useEffect(() => {
		// "cancelled" prevents setting the state after the component has been
		// unmounted (e.g. the user leaves the page before the fetch completes).
		let cancelled = false;

		const loadReservation = async () => {
			try {
				// Getting the reservation and its equipment rules is done in sequence
				const res = await API.getReservation(reservationId);
				if (cancelled) return;
				setReservation(res);
				
				// rules contains all the equipment of this facility type, with their minimum and available quantities
				const rules = await API.getEquipment(res.facilityTypeId);
				if (cancelled) return;
				setEquipmentRules(rules);

				// Starting quantities: for every equipment of this facility type,
				// how much of it is already part of this reservation (0 if none).
				const startQuantities = {};
				rules.forEach((eq) => {
					// res.equipment is the list of the equipment of this reservation
					// check if this equipment is already present in the reservation, and if so use its quantity, otherwise 0.
					const existing = res.equipment.find((e) => e.equipmentId === eq.id);
					if (existing) startQuantities[eq.id] = existing.quantity;
					else startQuantities[eq.id] = 0;
				});
				setQuantities(startQuantities);
				setInitialQuantities(startQuantities);
			} catch (err) {
				handleErrors(err);
			} finally {
				if (!cancelled) setWaiting(false);
			}
		};

		loadReservation();

		return () => {
			cancelled = true;
		};
	}, [reservationId]);

	/**
	 * INPUT (params):
	 * - equipment: the equipment object being changed
	 *
	 * OUTPUT (return value):
	 * - number: the lowest quantity of this item that THIS reservation may end
	 *   up with. A mandatory type must always keep at least its minimum
	 *   quantity, while an optional type (minQuantity === 0) may be removed
	 *   completely.
	 */
	const getEffectiveMin = (equipment) => {
		return equipment.minQuantity;
	};

	/**
	 * INPUT (params, positional):
	 * - equipment: the equipment object being changed
	 *
	 * OUTPUT (return value):
	 * - number: the highest quantity of this item that THIS reservation may end
	 *   up with.
	 */
	const getEffectiveMax = (equipment) => {
		// - availableQuantity: what is free in the sport center right now, not counting the 
		// units already held by this reservation (they were subtracted from the pool when it was created)
		// - initialQuantities[equipment.id]: how many units of this equipment are already held by this reservation
		// So the maximum quantity is here computeted as the sum of the center availability and a delta
		if (user.score < 0) return initialQuantities[equipment.id];
		return equipment.availableQuantity + initialQuantities[equipment.id];
	};

	/**
	 *
	 * INPUT (params, positional):
	 * - equipment: the equipment object whose quantity is being changed
	 * - delta: number, how much to add to the current quantity (+1 or -1)
	 *
	 */
	const handleQuantityChange = (equipment, delta) => {
		setQuantities((prev) => {
			const current = prev[equipment.id];
			let next = current + delta;

			// The quantity is kept inside the allowed interval: mandatory items
			// stop at their minimum, optional ones at 0.
			const effectiveMin = getEffectiveMin(equipment);
			if (next < effectiveMin) next = effectiveMin;

			const effectiveMax = getEffectiveMax(equipment);
			if (next > effectiveMax) next = effectiveMax;

			// A copy of the whole object is created, so prev is never modified
			// in order to leave the state immutable.
			const updated = { ...prev };
			updated[equipment.id] = next;
			return updated;
		});
	};

	/**
	 * INPUT (params, positional):
	 * - event: the (synthetic) form submit / button click event
	 */
	const handleSubmit = (event) => {
		// prevent the default form submission, which would reload the page and lose the state
		event.preventDefault();

		// The full equipment list is sent (mandatory items with at least their
		// minimum quantity, optional items with their possibly modified one).
		// Items at 0 are dropped, exactly as when a reservation is created.
		const equipment = Object.entries(quantities)
			.filter(([, quantity]) => quantity > 0)
			.map(([equipmentId, quantity]) => ({
				equipmentId: Number(equipmentId),
				quantity: quantity,
			}));

		setFormDisabled(true);
		API.updateReservation(reservationId, equipment)
			.then(() => {
				showSuccess("Reservation updated.");
				navigate("/reservations");
			})
			.catch((err) => handleErrors(err))
			.finally(() => setFormDisabled(false));
	};

	if (waiting) {
		return (
			<Container fluid className="py-4">
				<Spinner />
			</Container>
		);
	}

	// The reservation could not be loaded at all

	if (!reservation) {
		return (
			<Container fluid className="py-4">
				<Alert variant="danger">This reservation could not be loaded.</Alert>
				<Button variant="secondary" onClick={() => navigate("/reservations")}>
					Back to my reservations
				</Button>
			</Container>
		);
	}

	// Mandatory equipment (editable, but never below its minimum) and optional
	// equipment (editable, and removable completely).
	const mandatory = equipmentRules.filter((eq) => eq.minQuantity > 0);
	const optional = equipmentRules.filter((eq) => eq.minQuantity === 0);

	// A negative score allows removing equipment, never adding it.
	const canAdd = user.score >= 0;

	// Warning shown to users with a negative score
	let negativeScoreAlert = null;
	if (!canAdd) {
		negativeScoreAlert = (
			<Alert variant="warning">
				Your score is negative: you can still remove equipment, but you cannot
				add any. Logging in again with the 2FA code brings your score back to
				zero.
			</Alert>
		);
	}

	/**
	 * renderEquipmentRow
	 *
	 * INPUT (params, positional):
	 * - equipment: the equipment object to be shown
	 *
	 * OUTPUT (return value):
	 * - JSX: one row with the name of the item, its limits, and the - / +
	 *   buttons enabled according to the limits computed above
	 */
	const renderEquipmentRow = (equipment) => {
		const quantity = quantities[equipment.id];
		return (
			<EquipmentRow
				key={equipment.id}
				equipment={equipment}
				quantity={quantity}
				canDecrease={quantity > getEffectiveMin(equipment)}
				canIncrease={canAdd && quantity < getEffectiveMax(equipment)}
				handleQuantityChange={handleQuantityChange}
				formDisabled={formDisabled}
			/>
		);
	};

	// Mandatory section
	let mandatoryContent;
	if (mandatory.length === 0) {
		mandatoryContent = <p className="text-muted">N/A</p>;
	} else {
		mandatoryContent = mandatory.map((eq) => renderEquipmentRow(eq));
	}

	// Optional section
	let optionalContent;
	if (optional.length === 0) {
		optionalContent = <p className="text-muted">N/A</p>;
	} else {
		optionalContent = optional.map((eq) => renderEquipmentRow(eq));
	}

	return (
		<Container fluid className="py-4">
			<h1 className="mb-4">
				Modify reservation: {formatName(reservation.facilityTypeName)} (
				{reservation.facilityCode})
			</h1>

			{negativeScoreAlert}

			<Card className="p-3 mb-4">
				<h2 className="h5">Equipment</h2>
				<p className="text-muted small mb-3">
					Use the + and - buttons to adjust the quantities. The mandatory
					equipment cannot go below the minimum required by this facility.
				</p>

				<hr />

				<p className="text-muted small mb-2">Mandatory</p>
				{mandatoryContent}

				<p className="text-muted small mb-2 mt-3">Optional</p>
				{optionalContent}
			</Card>

			<Button
				variant="success"
				type="button"
				onClick={handleSubmit}
				disabled={formDisabled}
			>
				{formDisabled ? "Saving..." : "Save changes"}
			</Button>
			<Button
				variant="secondary"
				type="button"
				className="ms-2"
				onClick={() => navigate("/reservations")}
				disabled={formDisabled}
			>
				Cancel
			</Button>
		</Container>
	);
}

export default ReservationEdit;
