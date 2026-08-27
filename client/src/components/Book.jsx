import { useState, useEffect } from "react";
import { Container, Form, Card, Button, Alert, Badge } from "react-bootstrap";
import { useNavigate } from "react-router";
import API from "../API.js";
import { formatName } from "../utils.js";

// -----------------------------------------------------------------------------
// LOCAL RENDER FUNCTIONS
// -----------------------------------------------------------------------------

// Renders the "1. Facility" card: type dropdown, manual/automatic radio, and,
// if manual, the list of free facilities of the selected type.
function renderFacilitySelection({
	facilityTypes,
	selectedTypeId,
	setSelectedTypeId,
	mode,
	setMode,
	freeFacilities,
	selectedFacilityCode,
	setSelectedFacilityCode,
	formDisabled,
}) {
	return (
		<Card className="p-3 mb-4">
			<h2 className="h5">1. Facility</h2>

			<Form.Group className="mb-3">
				<Form.Label>Type</Form.Label>
				<Form.Select
					value={selectedTypeId}
					onChange={(ev) => setSelectedTypeId(ev.target.value)}
					disabled={formDisabled}
				>
					<option value="">-- Select a type --</option>
					{facilityTypes.map((ft) => (
						<option key={ft.id} value={ft.id}>
							{formatName(ft.name)}
						</option>
					))}
				</Form.Select>
			</Form.Group>

			{selectedTypeId ? (
				<>
					<Form.Group className="mb-3">
						<Form.Check
							inline
							type="radio"
							name="mode"
							id="mode-manual"
							label="Manual selection"
							checked={mode === "manual"}
							onChange={() => setMode("manual")}
							disabled={formDisabled}
						/>
						<Form.Check
							inline
							type="radio"
							name="mode"
							id="mode-automatic"
							label="Automatic assignment"
							checked={mode === "automatic"}
							onChange={() => setMode("automatic")}
							disabled={formDisabled}
						/>
					</Form.Group>

					{mode === "manual" ? (
						<Form.Group className="mb-3">
							{freeFacilities.length === 0 ? (
								<p className="text-muted">No free facilities of this type.</p>
							) : (
								freeFacilities.map((f) => (
									<Form.Check
										key={f.code}
										type="radio"
										name="facilityCode"
										id={"facility-" + f.code}
										checked={f.code === selectedFacilityCode}
										onChange={() => setSelectedFacilityCode(f.code)}
										disabled={formDisabled}
										label={
											<>
												<Badge bg="primary" className="me-2">
													{f.code}
												</Badge>
												Free
											</>
										}
									/>
								))
							)}
						</Form.Group>
					) : null}
				</>
			) : null}
		</Card>
	);
}

// Renders one equipment row (name, min/available info, +/- quantity controls).
function renderEquipmentRow(
	eq,
	quantities,
	handleQuantityChange,
	formDisabled,
) {
	return (
		<div
			key={eq.id}
			className="d-flex align-items-center justify-content-between mb-2"
		>
			<div>
				{formatName(eq.name)}{" "}
				{eq.minQuantity > 0 ? (
					<Badge bg="secondary">min {eq.minQuantity}</Badge>
				) : null}{" "}
				<span className="text-muted small">avail. {eq.availableQuantity}</span>
			</div>
			<div className="d-flex align-items-center">
				<Button
					size="sm"
					variant="outline-secondary"
					type="button"
					disabled={formDisabled}
					onClick={() => handleQuantityChange(eq, -1)}
				>
					-
				</Button>
				<span className="mx-2">{quantities[eq.id]}</span>
				<Button
					size="sm"
					variant="outline-secondary"
					type="button"
					disabled={formDisabled}
					onClick={() => handleQuantityChange(eq, 1)}
				>
					+
				</Button>
			</div>
		</div>
	);
}

// Renders the "2. Equipment" card: mandatory and optional equipment rows.
function renderEquipmentSelection({
	equipmentRules,
	quantities,
	handleQuantityChange,
	formDisabled,
}) {
	const mandatory = equipmentRules.filter((eq) => eq.minQuantity > 0);
	const optional = equipmentRules.filter((eq) => eq.minQuantity === 0);

	return (
		<Card className="p-3 mb-4">
			<h2 className="h5">2. Equipment</h2>

			<div className="text-muted small mb-2">
				Mandatory — the minimum quantity is always included
			</div>
			{mandatory.length === 0 ? (
				<p className="text-muted">—</p>
			) : (
				mandatory.map((eq) =>
					renderEquipmentRow(
						eq,
						quantities,
						handleQuantityChange,
						formDisabled,
					),
				)
			)}

			<div className="text-muted small mb-2 mt-3">Optional</div>
			{optional.length === 0 ? (
				<p className="text-muted">—</p>
			) : (
				optional.map((eq) =>
					renderEquipmentRow(
						eq,
						quantities,
						handleQuantityChange,
						formDisabled,
					),
				)
			)}
		</Card>
	);
}

// Builds the initial quantities map for a set of equipment rules: mandatory
// items start at their minimum required quantity, optional items start at 0.
function buildInitialQuantities(rules) {
	const quantities = {};
	rules.forEach((eq) => {
		quantities[eq.id] = eq.minQuantity > 0 ? eq.minQuantity : 0;
	});
	return quantities;
}

// -----------------------------------------------------------------------------
// MAIN COMPONENT
// -----------------------------------------------------------------------------

function Book() {
	const navigate = useNavigate();

	const [facilityTypes, setFacilityTypes] = useState([]);
	const [selectedTypeId, setSelectedTypeId] = useState("");

	const [mode, setMode] = useState("manual"); // "manual" | "automatic"
	const [freeFacilities, setFreeFacilities] = useState([]);
	const [selectedFacilityCode, setSelectedFacilityCode] = useState("");

	const [equipmentRules, setEquipmentRules] = useState([]);
	const [quantities, setQuantities] = useState({});

	const [errorMsg, setErrorMsg] = useState("");
	const [formDisabled, setFormDisabled] = useState(false);

	// If an error occurs, the error message will be shown using a state.
	const handleServerError = (err) => {
		let msg = "";
		if (err.error) msg = err.error;
		else if (typeof err === "string") msg = String(err);
		else msg = "Unknown Error";
		setErrorMsg(msg);
	};

	useEffect(() => {
		API.getFacilityTypes()
			.then((types) => setFacilityTypes(types))
			.catch((err) => handleServerError(err));
	}, []);

	useEffect(() => {
		setSelectedFacilityCode("");
		setErrorMsg("");

		if (!selectedTypeId) {
			setFreeFacilities([]);
			setEquipmentRules([]);
			setQuantities({});
			return;
		}

		API.getFacilities("free")
			.then((facilities) => {
				const filtered = facilities.filter(
					(f) => f.facilityTypeId === Number(selectedTypeId),
				);
				setFreeFacilities(filtered);
			})
			.catch((err) => handleServerError(err));

		API.getEquipment(Number(selectedTypeId))
			.then((rules) => {
				setEquipmentRules(rules);
				setQuantities(buildInitialQuantities(rules));
			})
			.catch((err) => handleServerError(err));
	}, [selectedTypeId]);

	const handleQuantityChange = (eq, delta) => {
		setQuantities((prev) => {
			const current = prev[eq.id];
			let next = current + delta;
			if (next < eq.minQuantity) next = eq.minQuantity;
			if (next > eq.availableQuantity) next = eq.availableQuantity;
			return { ...prev, [eq.id]: next };
		});
	};

	const handleSubmit = (event) => {
		event.preventDefault();
		setErrorMsg("");

		if (!selectedTypeId) {
			setErrorMsg("Please select a facility type.");
			return;
		}
		if (mode === "manual" && !selectedFacilityCode) {
			setErrorMsg("Please select a facility from the list.");
			return;
		}

		const equipment = Object.entries(quantities)
			.filter(([, qty]) => qty > 0)
			.map(([equipmentId, quantity]) => ({
				equipmentId: Number(equipmentId),
				quantity,
			}));

		const reservation = {
			facilityTypeId: Number(selectedTypeId),
			equipment,
		};
		if (mode === "manual") {
			reservation.facilityCode = selectedFacilityCode;
		}

		setFormDisabled(true);
		API.createReservation(reservation)
			.then(() => navigate("/reservations"))
			.catch((err) => handleServerError(err))
			.finally(() => setFormDisabled(false));
	};

	return (
		<Container fluid className="py-4">
			<h1 className="mb-4">New reservation</h1>

			{errorMsg ? (
				<Alert variant="danger" dismissible onClose={() => setErrorMsg("")}>
					{errorMsg}
				</Alert>
			) : null}

			<Form onSubmit={handleSubmit}>
				{renderFacilitySelection({
					facilityTypes,
					selectedTypeId,
					setSelectedTypeId,
					mode,
					setMode,
					freeFacilities,
					selectedFacilityCode,
					setSelectedFacilityCode,
					formDisabled,
				})}

				{selectedTypeId
					? renderEquipmentSelection({
							equipmentRules,
							quantities,
							handleQuantityChange,
							formDisabled,
						})
					: null}

				<Button
					type="submit"
					variant="success"
					disabled={!selectedTypeId || formDisabled}
				>
					{formDisabled ? "Saving..." : "Confirm reservation"}
				</Button>
			</Form>
		</Container>
	);
}

export default Book;