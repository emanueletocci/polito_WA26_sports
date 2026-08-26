import { useState, useEffect } from "react";
import { Container, Table, Badge, Button, Alert } from "react-bootstrap";
import API from "../API.js";
import { formatName } from "../utils.js";
import { Link } from "react-router";

// Renders one reservation as a table row: facility name/code, equipment badges,
// status, and the modify/delete actions.
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
				<Button
					as={Link}
					to={"/reservations/" + r.id + "/edit"}
					variant="warning"
					size="sm"
					className="me-2"
				>
					Modify
				</Button>
				<Button variant="danger" size="sm" onClick={() => onDelete(r.id)}>
					Delete
				</Button>
			</td>
		</tr>
	);
}

function Reservations({ refreshUserInfo }) {
	const [reservations, setReservations] = useState([]);
	const [errorMsg, setErrorMsg] = useState("");

	useEffect(() => {
		API.getReservations()
			.then((data) => setReservations(data))
			.catch((err) => {
				console.error("Error fetching reservations:", err);
				setErrorMsg("Could not load your reservations.");
			});
	}, []);

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

			{errorMsg && (
				<Alert variant="danger" dismissible onClose={() => setErrorMsg("")}>
					{errorMsg}
				</Alert>
			)}

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
						{reservations.map((r) => renderReservationRow(r, handleDelete))}
					</tbody>
				</Table>
			)}
		</Container>
	);
}

export default Reservations;
