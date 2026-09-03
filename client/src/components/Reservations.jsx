import { useState, useEffect } from "react";
import { Container, Table, Badge, Button, Spinner } from "react-bootstrap";
import { Link } from "react-router";

import API from "../API.js";
import { formatName } from "../utils.js";

/**
 *
 * INPUT (props, passed as a single object):
 * - reservation: one reservation object { id, facilityTypeName, facilityCode,
 *   equipment }, where equipment is an array of { equipmentId, name, quantity }
 * - onDelete: function(reservationId), called when the "Delete" button of this
 *   row is clicked
 * - disabled: boolean, true while a delete request is in progress
 *
 * OUTPUT (return value):
 * - JSX: one <tr> describing this reservation, with the actions to modify or
 *   delete it
 */
function ReservationRow(props) {
	const reservation = props.reservation;

	// One badge per equipment item rented with this reservation. When the
	// reservation has no equipment at all a placeholder is shown instead.
	let equipmentContent;
	if (reservation.equipment.length === 0) {
		equipmentContent = <span className="text-muted">N/A</span>;
	} else {
		equipmentContent = reservation.equipment.map((eq) => (
			<Badge key={eq.equipmentId} bg="info" text="dark" className="me-1 mb-1">
				{formatName(eq.name)} &times;{eq.quantity}
			</Badge>
		));
	}

	return (
		<tr>
			<td>{formatName(reservation.facilityTypeName)}</td>
			<td>
				<Badge bg="primary">{reservation.facilityCode}</Badge>
			</td>
			<td>{equipmentContent}</td>
			<td>
				{/* "Edit" button redirect to the page that modifies this specific reservation */}
				<Button
					as={Link}
					to={"/reservations/" + reservation.id + "/edit"}
					variant="warning"
					size="sm"
					className="me-2"
					disabled={props.disabled}
				>
					Edit
				</Button>
				{/* "Delete" asks the parent to remove this reservation */}
				<Button
					variant="danger"
					size="sm"
					disabled={props.disabled}
					onClick={() => props.onDelete(reservation.id)}
				>
					Delete
				</Button>
			</td>
		</tr>
	);
}

/**
 *
 * INPUT (props, passed as a single object):
 * - refreshUserInfo: function, re-fetches the info of the current user (needed
 *   because deleting a reservation changes the score on the server)
 * - showSuccess: function(text), shows a confirmation message to the user
 * - handleErrors: function(err), shows the reason of a failed operation
 *
 * OUTPUT (return value):
 * - JSX: the "My reservations" page, showing either a placeholder message (no
 *   reservations) or a table with one row per reservation
 */
function Reservations(props) {
	const { refreshUserInfo, showSuccess, handleErrors } = props;

	// reservations: the active reservations of the current user
	const [reservations, setReservations] = useState([]);

	// disabled: true while a delete request is in progress, to avoid sending the
	// same request twice with a double click
	const [disabled, setDisabled] = useState(false);

	// waiting: true while the first fetch is running. Without it the "no
	// reservations" message would be shown for an instant even to a user who has
	// some, because the state starts as an empty array.
	const [waiting, setWaiting] = useState(true);

	// Load the reservations once, when the page mounts.
	useEffect(() => {
		API.getReservations()
			.then((data) => setReservations(data))
			.catch((err) => handleErrors(err))
			.finally(() => setWaiting(false));
	}, []);

	/**
	 * INPUT (params):
	 * - reservationId: the id of the reservation to delete
	 */
	const handleDelete = (reservationId) => {
		setDisabled(true);
		API.deleteReservation(reservationId)
			.then(() => {
				// Remove the deleted reservation from the local state.
				setReservations((prev) => prev.filter((r) => r.id !== reservationId));
				showSuccess(
					"Reservation deleted: the facility and its equipment are available again. Your score decreased by 1.",
				);
				// The score changed on the server, so the user info is fetched again.
				refreshUserInfo();
			})
			.catch((err) => handleErrors(err))
			.finally(() => setDisabled(false));
	};

	// What to show instead of the table while the reservations are being loaded,
	// and when the user has no reservation yet, is decided before the return,
	// with a standard if/else.
	let content;
	if (waiting) {
		content = <Spinner />;
	} else if (reservations.length === 0) {
		content = (
			<p className="text-muted">
				You have no active reservations. Use the "Book" button in the navigation
				bar to create one.
			</p>
		);
	} else {
		content = (
			<Table bordered hover>
				<thead>
					<tr>
						<th>Facility</th>
						<th>Facility code</th>
						<th>Equipment</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{/* One row per reservation */}
					{reservations.map((r) => (
						<ReservationRow
							key={r.id}
							reservation={r}
							onDelete={handleDelete}
							disabled={disabled}
						/>
					))}
				</tbody>
			</Table>
		);
	}

	return (
		<Container fluid className="py-4">
			<h1 className="mb-4">My reservations</h1>
			{content}
		</Container>
	);
}

export default Reservations;
