import { useState, useEffect } from "react";
import { Container, Card, Button, Alert } from "react-bootstrap";
import { useNavigate, useParams } from "react-router";

import API from "../API.js";
import { formatName } from "../utils.js";
import { EquipmentRow } from "./EquipmentSelection.jsx";

// -----------------------------------------------------------------------------
// RULES OF THIS PAGE (from the exam text and the course forum):
// - The mandatory equipment CANNOT be changed here: it must stay exactly as it
//   was when the reservation was created. It is shown, but read-only.
// - The optional equipment can be freely added or removed...
// - ...unless the user's score is negative: in that case it can only be REMOVED,
//   never added (forum, Enrico Masala, 25/08/26: "still be able to modify it but
//   only for removing extra equipment, not for adding anything").
// As always, these rules are enforced by the server: what is done here only
// prevents the user from attempting an operation that would be rejected.
// -----------------------------------------------------------------------------

/**
 * ReservationEdit
 *
 * INPUT (props, passed as a single object):
 * - user: object, the currently logged-in user (user.score decides whether
 *   optional equipment may be added)
 * - showSuccess: function(text), shows a confirmation message to the user
 * - handleErrors: function(err), shows the reason of a failed operation
 *
 * OUTPUT (return value):
 * - JSX: the page that modifies the equipment of one existing reservation,
 *   identified by the ":reservationId" parameter of the URL
 */
function ReservationEdit(props) {
	// reservationId comes from the URL, e.g. "/reservations/12/edit" -> "12"
	const { reservationId } = useParams();
	const navigate = useNavigate();

	// The props used inside the effect are destructured here, and not read as
	// props.something inside it: this way the effect declares exactly which value
	// it depends on, instead of depending on the whole props object (which changes
	// identity at every render of the parent).
	const { user, showSuccess, handleErrors } = props;

	// reservation: the reservation being modified, as loaded from the server
	// (null while it is still loading, or if it could not be loaded at all)
	const [reservation, setReservation] = useState(null);
	// equipmentRules: all the equipment (mandatory and optional) of this
	// reservation's facility type, e.g. [{ id, name, minQuantity, availableQuantity }, ...]
	const [equipmentRules, setEquipmentRules] = useState([]);
	// quantities: equipment id -> currently selected quantity (editable)
	const [quantities, setQuantities] = useState({});
	// initialQuantities: equipment id -> quantity at page load. It is a snapshot,
	// never modified by the user, needed to compute correctly how much of an item
	// THIS reservation may still ask for (see the note in handleQuantityChange).
	const [initialQuantities, setInitialQuantities] = useState({});

	const [loading, setLoading] = useState(true);
	const [formDisabled, setFormDisabled] = useState(false);

	// ---- Load the reservation, then the equipment of its facility type ----
	useEffect(() => {
		// "cancelled" prevents setting the state after the component has been
		// unmounted (e.g. the user leaves the page before the fetch completes).
		let cancelled = false;

		API.getReservation(reservationId)
			.then((res) => {
				if (cancelled) return;
				setReservation(res);

				return API.getEquipment(res.facilityTypeId).then((rules) => {
					if (cancelled) return;
					setEquipmentRules(rules);

					// Starting quantities: for every equipment of this facility type,
					// how much of it is already part of this reservation (0 if none).
					const startQuantities = {};
					rules.forEach((eq) => {
						const existing = res.equipment.find((e) => e.equipmentId === eq.id);
						if (existing) startQuantities[eq.id] = existing.quantity;
						else startQuantities[eq.id] = 0;
					});
					setQuantities(startQuantities);
					setInitialQuantities(startQuantities);
				});
			})
			.catch((err) => handleErrors(err))
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
		// Only reservationId is listed: handleErrors is omitted on purpose, because
		// it is re-created at every render of App and listing it would reload the
		// reservation at every render of the parent. Its behaviour never changes.
	}, [reservationId]);

	/**
	 * getEffectiveMax
	 *
	 * INPUT (params, positional):
	 * - equipment: the equipment object being changed
	 *
	 * OUTPUT (return value):
	 * - number: the highest quantity of this item that THIS reservation may end
	 *   up with. availableQuantity is what is free right now in the whole sport
	 *   center and does NOT include the units already held by this reservation
	 *   (they were subtracted from the pool when it was created), so the units
	 *   already held must be added back.
	 *   NB: this is only as fresh as the snapshot taken at page load. The server
	 *   checks the availability again when the change is submitted, and rejects
	 *   the request if in the meantime the units are gone.
	 */
	const getEffectiveMax = (equipment) => {
		return equipment.availableQuantity + initialQuantities[equipment.id];
	};

	/**
	 * handleQuantityChange
	 *
	 * INPUT (params, positional):
	 * - equipment: the equipment object whose quantity is being changed
	 * - delta: number, how much to add to the current quantity (+1 or -1)
	 *
	 * OUTPUT (return value):
	 * - none (undefined). Its job is a SIDE EFFECT: it updates the "quantities" state.
	 */
	const handleQuantityChange = (equipment, delta) => {
		setQuantities((prev) => {
			const current = prev[equipment.id];
			let next = current + delta;

			// Optional equipment has no minimum: never below 0.
			if (next < 0) next = 0;

			const effectiveMax = getEffectiveMax(equipment);
			if (next > effectiveMax) next = effectiveMax;

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
	 * - event: the (synthetic) form submit / button click event
	 *
	 * OUTPUT (return value):
	 * - none (undefined). Its job is a SIDE EFFECT: it sends the new equipment
	 *   list to the server and, depending on the outcome, shows a confirmation
	 *   and goes back to the reservations page, or shows the error.
	 */
	const handleSubmit = (event) => {
		event.preventDefault();

		// The full equipment list is sent (mandatory items unchanged, optional
		// items with their possibly modified quantity). Items at 0 are dropped,
		// exactly as when a reservation is created.
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

	// ---- Loading state ----
	if (loading) {
		return (
			<Container fluid className="py-4">
				<p className="text-muted">Loading reservation...</p>
			</Container>
		);
	}

	// ---- The reservation could not be loaded at all ----
	// The reason has already been shown by handleErrors: here the user is only
	// given a clearly visible way back.
	if (!reservation) {
		return (
			<Container fluid className="py-4">
				<Alert variant="danger">
					This reservation could not be loaded.
				</Alert>
				<Button variant="secondary" onClick={() => navigate("/reservations")}>
					Back to my reservations
				</Button>
			</Container>
		);
	}

	// Mandatory equipment (read-only here) and optional equipment (editable,
	// within the limits described at the top of this file).
	const mandatory = equipmentRules.filter((eq) => eq.minQuantity > 0);
	const optional = equipmentRules.filter((eq) => eq.minQuantity === 0);

	// A negative score allows removing equipment, never adding it.
	const canAddOptional = user.score >= 0;

	// ---- Warning shown to users with a negative score ----
	let negativeScoreAlert = null;
	if (!canAddOptional) {
		negativeScoreAlert = (
			<Alert variant="warning">
				Your score is negative: you can still remove equipment, but you cannot
				add any. Logging in again with the 2FA code brings your score back to
				zero.
			</Alert>
		);
	}

	// ---- Mandatory section: shown, but not editable ----
	let mandatoryContent;
	if (mandatory.length === 0) {
		mandatoryContent = <p className="text-muted">N/A</p>;
	} else {
		mandatoryContent = mandatory.map((eq) => (
			<EquipmentRow
				key={eq.id}
				equipment={eq}
				quantity={quantities[eq.id]}
				readOnly={true}
				readOnlyLabel="Mandatory, locked"
			/>
		));
	}

	// ---- Optional section: editable ----
	let optionalContent;
	if (optional.length === 0) {
		optionalContent = <p className="text-muted">N/A</p>;
	} else {
		optionalContent = optional.map((eq) => (
			<EquipmentRow
				key={eq.id}
				equipment={eq}
				quantity={quantities[eq.id]}
				// Removing is always allowed, even with a negative score.
				canDecrease={quantities[eq.id] > 0}
				canIncrease={canAddOptional && quantities[eq.id] < getEffectiveMax(eq)}
				handleQuantityChange={handleQuantityChange}
				formDisabled={formDisabled}
			/>
		));
	}

	return (
		<Container fluid className="py-4">
			<h1 className="mb-4">
				Modify reservation — {formatName(reservation.facilityTypeName)} (
				{reservation.facilityCode})
			</h1>

			{negativeScoreAlert}

			<Card className="p-3 mb-4">
				<h2 className="h5">Equipment</h2>
				<p className="text-muted small mb-3">
					The mandatory equipment cannot be changed. Use the + and - buttons to
					adjust the optional one.
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
