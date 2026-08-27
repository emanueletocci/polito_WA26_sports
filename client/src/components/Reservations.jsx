import { useState, useEffect } from "react";
import { Container, Table, Badge, Button, Alert } from "react-bootstrap";
import API from "../API.js";
import { formatName } from "../utils.js";
import { Link } from "react-router";

/**
 * Renders one reservation as a table row: facility name/code, equipment badges,
 * status, and the modify/delete actions.
 *
 * INPUT:
 * - r: a single reservation object { id, facilityTypeName, facilityCode, equipment }
 *   where equipment is an array of { equipmentId, name, quantity }
 * - onDelete: function(reservationId), called when the "Delete" button
 *   for this row is clicked
 *
 * OUTPUT (return value):
 * - a single <tr> representing this reservation
 */
function renderReservationRow(r, onDelete) {
	return (
		<tr key={r.id}>
			<td>{formatName(r.facilityTypeName)}</td>
			<td>
				<Badge bg="primary" pill>
					{r.facilityCode}
				</Badge>
			</td>
			<td>
				{/* One Badge per equipment item booked with this reservation */}
				{r.equipment.map((eq) => (
					<Badge
						key={eq.equipmentId}
						bg="info"
						text="dark"
						pill
						className="me-1 mb-1"
					>
						{formatName(eq.name)} &times;{eq.quantity}
					</Badge>
				))}
			</td>
			<td>
				<Badge bg="success">Active</Badge>
			</td>
			<td>
				{/* "Edit" navigates to the edit page for this specific reservation */}
				<Button
					as={Link}
					to={"/reservations/" + r.id + "/edit"}
					variant="warning"
					size="sm"
					className="me-2"
				>
					Edit
				</Button>
				{/* "Delete" triggers onDelete with this reservation's id */}
				<Button variant="danger" size="sm" onClick={() => onDelete(r.id)}>
					Delete
				</Button>
			</td>
		</tr>
	);
}

/**
 * Reservations
 *
 * INPUT (props, passed as a single object):
 * - refreshUserInfo: function, called to re-fetch/update the current user info
 *   (needed because deleting a reservation changes the user's score server-side)
 *
 * OUTPUT (return value):
 * - JSX: the "My reservations" page, showing either a placeholder message
 *   (no reservations) or a table with one row per reservation
 */
function Reservations({ refreshUserInfo }) {
	// reservations: the list of the current user's reservations
	const [reservations, setReservations] = useState([]);
	// errorMsg: text shown in the red Alert box; empty string = no error
	const [errorMsg, setErrorMsg] = useState("");

	// Fetch the reservations once, when the page mounts.
	useEffect(() => {
		API.getReservations()
			.then((data) => setReservations(data))
			.catch((err) => {
				console.error("Error fetching reservations:", err);
				setErrorMsg("Could not load your reservations.");
			});
	}, []);

	/**
	 * handleDelete
	 *
	 * INPUT (params, positional):
	 * - reservationId: the id of the reservation to delete
	 *
	 * OUTPUT (return value):
	 * - none (undefined). Its job is a SIDE EFFECT: it calls the API to delete
	 *   the reservation, then updates local state and refreshes the user info.
	 */
	const handleDelete = (reservationId) => {
		API.deleteReservation(reservationId)
			.then(() => {
				// Remove the deleted reservation from local state.
				setReservations((prev) => prev.filter((r) => r.id !== reservationId));
				// Rehydrate the user info, since deleting a reservation changes the score server-side.
				refreshUserInfo();
			})
			.catch((err) => {
				console.error("Error deleting reservation:", err);
				setErrorMsg(err.error || "Could not delete the reservation.");
			});
	};

	return (
		<Container fluid className="py-4">
			<h1 className="mb-4">My reservations</h1>

			{/*
				This is NOT a ternary: {errorMsg && (...)} is a logical AND
				short-circuit. If errorMsg is a non-empty string (truthy), React
				renders the Alert. If errorMsg is "" (falsy), nothing is rendered.
			*/}
			{errorMsg && (
				<Alert variant="danger" dismissible onClose={() => setErrorMsg("")}>
					{errorMsg}
				</Alert>
			)}

			{/*
				Ternary deciding what to show instead of the table:
				- if there are no reservations, show a placeholder message
				- otherwise, show the full table with one row per reservation
			*/}
			{reservations.length === 0 ? (
				<p className="text-muted">You have no active reservations.</p>
			) : (
				<Table bordered hover>
					<thead>
						<tr>
							<th>Facility</th>
							<th>Facility Code</th>
							<th>Equipment</th>
							<th>Status</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						{/* One row per reservation, built via renderReservationRow */}
						{reservations.map((r) => renderReservationRow(r, handleDelete))}
					</tbody>
				</Table>
			)}
		</Container>
	);
}

export default Reservations;
