import { useState, useEffect } from "react";
import { Container, Table, Badge, Button, Alert } from "react-bootstrap";
import { useNavigate, useParams } from "react-router";
import API from "../API.js";
import { formatName } from "../utils.js";

// -----------------------------------------------------------------------------
// REQUIREMENTS RECAP
// - Mandatory equipment CANNOT be changed here: it must stay exactly as it
//   was when the reservation was created... It is shown read-only.
// - Optional equipment CAN be freely increased/decreased...
// - ...UNLESS the user's score is negative: in that case, optional equipment
//   can only be DECREASED (removed), never increased/added
// -----------------------------------------------------------------------------

/**
 * renderMandatoryRow
 *
 * INPUT (params, positional):
 * - eq: an equipment rule object { id, name, minQuantity, availableQuantity }
 * - quantity: number, the quantity currently reserved for this equipment
 *   (fixed, cannot be changed by the user)
 *
 * OUTPUT (return value):
 * - JSX: a read-only <tr> for a mandatory equipment item
 */
function renderMandatoryRow(eq, quantity) {
	return (
		<tr key={eq.id}>
			<td>
				{formatName(eq.name)} <Badge bg="secondary">mandatory, locked</Badge>
			</td>
			<td>{quantity}</td>
		</tr>
	);
}

/**
 * renderOptionalRow
 *
 * INPUT (params, positional):
 * - eq: an equipment rule object { id, name, minQuantity, availableQuantity }
 * - quantity: number, the quantity currently selected for this equipment
 * - canAdd: boolean, whether the "+" button is allowed
 *   (false when the user's score is negative)
 * - handleQuantityChange: function(eq, delta), updates the quantity
 * - formDisabled: boolean, true while the form is submitting
 *
 * OUTPUT (return value):
 * - JSX: a <tr> for an optional equipment item, with +/- controls
 */
function renderOptionalRow(
	eq,
	quantity,
	canAdd,
	handleQuantityChange,
	formDisabled,
) {
	return (
		<tr key={eq.id}>
			<td>{formatName(eq.name)}</td>
			<td>
				<Button
					size="sm"
					variant="outline-secondary"
					type="button"
					disabled={formDisabled}
					// "-" is always allowed: removing equipment is permitted
					// even for users with a negative score.
					onClick={() => handleQuantityChange(eq, -1)}
				>
					-
				</Button>
				<span className="mx-2">{quantity}</span>
				<Button
					size="sm"
					variant="outline-secondary"
					type="button"
					// "+" is disabled while submitting, AND disabled entirely
					// if the user's score is negative (canAdd === false).
					disabled={formDisabled || !canAdd}
					onClick={() => handleQuantityChange(eq, 1)}
				>
					+
				</Button>
			</td>
		</tr>
	);
}

/**
 * ReservationEdit
 *
 * INPUT (props, passed as a single object):
 * - user: object, the currently logged-in user (needs user.score, to decide
 *   whether adding optional equipment is allowed)
 *
 * OUTPUT (return value):
 * - JSX: a page to modify the equipment of one existing reservation
 *   (identified by the ":reservationId" URL param)
 */
function ReservationEdit({ user }) {
	// reservationId comes from the URL, e.g. "/reservations/12/edit" -> "12"
	const { reservationId } = useParams();
	const navigate = useNavigate();

	// reservation: the reservation being edited, fetched from the server.
	// null while still loading.
	const [reservation, setReservation] = useState(null);
	// equipmentRules: all equipment rules (mandatory + optional) for this
	// reservation's facility type, e.g. [{ id, name, minQuantity, availableQuantity }, ...]
	const [equipmentRules, setEquipmentRules] = useState([]);
	// quantities: equipment id -> currently selected quantity (editable)
	const [quantities, setQuantities] = useState({});
	// initialQuantities: equipment id -> quantity as it was when the page
	// loaded (a snapshot, never changed by the user). Needed to correctly
	// compute how much of an item this SAME reservation may still request
	// (see the availability note below).
	const [initialQuantities, setInitialQuantities] = useState({});

	const [loading, setLoading] = useState(true);
	const [errorMsg, setErrorMsg] = useState("");
	const [formDisabled, setFormDisabled] = useState(false);

	const handleServerError = (err) => {
		let msg = "";
		if (err.error) msg = err.error;
		else if (typeof err === "string") msg = String(err);
		else msg = "Unknown Error";
		setErrorMsg(msg);
	};

	// ---- Load the reservation, then the equipment rules for its facility type ----
	useEffect(() => {
		// "cancelled" guards against setting state after the component has
		// unmounted (e.g. the user navigates away before the fetch completes).
		let cancelled = false;

		API.getReservation(reservationId)
			.then((res) => {
				if (cancelled) return;
				setReservation(res);

				return API.getEquipment(res.facilityTypeId).then((rules) => {
					if (cancelled) return;
					setEquipmentRules(rules);

					// Build the starting quantities: for each equipment rule,
					// look up how much of it is already part of this
					// reservation (0 if it isn't there at all).
					const startQuantities = {};
					rules.forEach((eq) => {
						const existing = res.equipment.find((e) => e.equipmentId === eq.id);
						startQuantities[eq.id] = existing ? existing.quantity : 0;
					});
					setQuantities(startQuantities);
					setInitialQuantities(startQuantities);
				});
			})
			.catch((err) => handleServerError(err))
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [reservationId]);

	/**
	 * handleQuantityChange
	 *
	 * INPUT (params, positional):
	 * - eq: the equipment rule object whose quantity is being changed
	 * - delta: number, how much to add to the current quantity (+1 or -1)
	 *
	 * OUTPUT (return value):
	 * - none (undefined). Side effect: updates the "quantities" state.
	 */
	const handleQuantityChange = (eq, delta) => {
		setQuantities((prev) => {
			const current = prev[eq.id];
			let next = current + delta;

			// Never go below 0 (optional equipment has no real minimum).
			if (next < 0) next = 0;

			// IMPORTANT / NOT YET FINAL (flagged for the backend race-condition
			// discussion): eq.availableQuantity, as returned by API.getEquipment,
			// is the quantity free RIGHT NOW across the whole system - it does
			// NOT include the units already held by THIS reservation (those
			// were already subtracted from the pool when the reservation was
			// created). So the real ceiling for "how much of this item can
			// THIS reservation end up with" is:
			//   eq.availableQuantity + initialQuantities[eq.id]
			// This is only as correct as the snapshot taken at page load: if
			// another user books/releases the same equipment in the meantime,
			// this client-side cap can go stale. The server MUST re-validate
			// availability (ideally inside a transaction) when the update is
			// actually submitted, and reject/report if it no longer holds.
			const effectiveMax = eq.availableQuantity + initialQuantities[eq.id];
			if (next > effectiveMax) next = effectiveMax;

			const updated = { ...prev };
			updated[eq.id] = next;
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
	 * - none (undefined). Side effect: sends the updated equipment list to
	 *   the server, then navigates back to "/reservations" on success.
	 */
	const handleSubmit = (event) => {
		event.preventDefault();
		setErrorMsg("");

		// Build the full equipment array to send (mandatory items unchanged,
		// optional items with their possibly-edited quantity). Items at 0
		// quantity are dropped, exactly like in Book.jsx.
		const equipment = Object.entries(quantities)
			.filter(([, qty]) => qty > 0)
			.map(([equipmentId, quantity]) => ({
				equipmentId: Number(equipmentId),
				quantity,
			}));

		setFormDisabled(true);
		API.updateReservation(reservationId, equipment)
			.then(() => navigate("/reservations"))
			.catch((err) => handleServerError(err))
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

	// ---- Error state: the reservation could not be loaded at all ----
	if (!reservation) {
		return (
			<Container fluid className="py-4">
				<Alert variant="danger">
					{errorMsg || "Could not load this reservation."}
				</Alert>
			</Container>
		);
	}

	// Split the equipment rules into mandatory (read-only here) and optional
	// (editable, within the score-based limits described above).
	const mandatory = equipmentRules.filter((eq) => eq.minQuantity > 0);
	const optional = equipmentRules.filter((eq) => eq.minQuantity === 0);

	// A negative score means the user may only REMOVE optional equipment in
	// this edit, never add more (see the forum clarification quoted above).
	const canAddOptional = user.score >= 0;

	// Decide whether to show the "negative score" warning, before the return.
	let negativeScoreWarning = null;
	if (!canAddOptional) {
		negativeScoreWarning = (
			<Alert variant="warning">
				Your score is negative: you may still remove equipment, but you cannot
				add optional equipment to this reservation.
			</Alert>
		);
	}

	// Decide whether to show the error alert, before the return.
	let errorAlert = null;
	if (errorMsg) {
		errorAlert = (
			<Alert variant="danger" dismissible onClose={() => setErrorMsg("")}>
				{errorMsg}
			</Alert>
		);
	}

	return (
		<Container fluid className="py-4">
			<h1 className="mb-4">
				Modify reservation — {formatName(reservation.facilityTypeName)} (
				{reservation.facilityCode})
			</h1>
			{errorAlert}
			{negativeScoreWarning}
			<Table bordered hover>
				<thead>
					<tr>
						<th>Equipment</th>
						<th>Quantity</th>
					</tr>
				</thead>
				<tbody>
					{/* Mandatory equipment: fixed, cannot be modified here */}
					{mandatory.map((eq) => renderMandatoryRow(eq, quantities[eq.id]))}

					{/* Optional equipment: editable, subject to the score rule above */}
					{optional.map((eq) =>
						renderOptionalRow(
							eq,
							quantities[eq.id],
							canAddOptional,
							handleQuantityChange,
							formDisabled,
						),
					)}
				</tbody>
			</Table>
			<Button
				variant="success"
				type="button"
				onClick={handleSubmit}
				disabled={formDisabled}
			>
				{formDisabled ? "Saving..." : "Save changes"}
			</Button>{" "}
			<Button
				variant="secondary"
				type="button"
				onClick={() => navigate("/reservations")}
				disabled={formDisabled}
			>
				Cancel
			</Button>
		</Container>
	);
}

export default ReservationEdit;
