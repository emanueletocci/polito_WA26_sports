import { useState, useEffect } from "react";
import {
	Container,
	Form,
	Card,
	Button,
	Alert,
	Badge,
	ButtonGroup,
	ToggleButton,
	Row,
	Col,
} from "react-bootstrap";
import { useNavigate } from "react-router";
import API from "../API.js";
import { formatName } from "../utils.js";

// -----------------------------------------------------------------------------
// LOCAL RENDER FUNCTIONS
// -----------------------------------------------------------------------------

/**
 * renderFacilitySelection
 *
 * INPUT (params, passed as a single object):
 * - facilityTypes: array of facility type objects, e.g. [{ id, name }, ...]
 * - selectedTypeId: string/number, the id of the currently selected type ("" if none)
 * - setSelectedTypeId: state setter function, updates selectedTypeId
 * - mode: string, either "manual" or "automatic"
 * - setMode: state setter function, updates mode
 * - freeFacilities: array of free facility objects, e.g. [{ code, facilityTypeId }, ...]
 * - selectedFacilityCode: string, the code of the currently selected facility ("" if none)
 * - setSelectedFacilityCode: state setter function, updates selectedFacilityCode
 * - formDisabled: boolean, true while the form is submitting (disables all inputs)
 *
 * OUTPUT (return value):
 * - JSX: a <Card> containing the "1. Facility" section of the form
 *   (type dropdown, manual/automatic radio buttons, and the list of free facilities)
 */
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
	// ---- Step 1: decide what to show for the "manual selection" list ----
	// Instead of a ternary inside the JSX, we compute the content here,
	// as a plain variable, using a standard if/else block.
	let freeFacilitiesContent;
	if (freeFacilities.length === 0) {
		freeFacilitiesContent = (
			<p className="text-muted">No free facilities of this type.</p>
		);
	} else {
		freeFacilitiesContent = freeFacilities.map((f) => (
			<Form.Check
				key={f.code}
				type="radio"
				name="facilityCode"
				id={"facility-" + f.code}
				// checked = this radio is selected only if its code matches the state
				checked={f.code === selectedFacilityCode}
				// onChange: user picked THIS facility -> save its code in the state
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
		));
	}

	// ---- Step 2: decide whether to show the manual facility list at all ----
	// This block is only rendered when mode is "manual".
	let manualFacilityBlock = null;
	if (mode === "manual") {
		manualFacilityBlock = (
			<Form.Group className="mb-3">{freeFacilitiesContent}</Form.Group>
		);
	}

	// ---- Step 3: decide whether to show mode selection + facility list ----
	// This whole block only appears once the user has picked a facility type.
	let modeAndFacilityBlock = null;
	if (selectedTypeId) {
		modeAndFacilityBlock = (
			<>
				<ButtonGroup className="mb-3">
					<ToggleButton
						id="mode-manual"
						type="radio"
						variant="outline-primary"
						name="mode"
						value="manual"
						checked={mode === "manual"}
						onChange={() => setMode("manual")}
						disabled={formDisabled}
					>
						Manual selection
					</ToggleButton>
					<ToggleButton
						id="mode-automatic"
						type="radio"
						variant="outline-primary"
						name="mode"
						value="automatic"
						checked={mode === "automatic"}
						onChange={() => setMode("automatic")}
						disabled={formDisabled}
					>
						Automatic assignment
					</ToggleButton>
				</ButtonGroup>

				{manualFacilityBlock}
			</>
		);
	}

	return (
		<Card className="p-3 mb-4">
			<h5>Facility</h5>
			<p className="text-muted small mb-3">
				Choose a sport type, then pick a specific facility or let the system
				assign one automatically.
			</p>

			<Form.Group className="mb-3">
				<Form.Label>Type</Form.Label>
				{/* dropdown menu */}

				{/*
					- ev is a (synthetic) event object
					- ev.target represents the DOM element that triggered/generated the event
					  (in this case, the <select> element the user interacted with)
					- ev.target.value represents the current value of that element
					  (in this case, the value of the <option> the user just selected)
				*/}
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

			{modeAndFacilityBlock}
		</Card>
	);
}

/**
 * renderEquipmentRow
 *
 * INPUT (params, positional):
 * - eq: a single equipment object, e.g. { id, name, minQuantity, availableQuantity }
 * - quantities: object mapping equipment id -> currently selected quantity, e.g. { 3: 2 }
 * - handleQuantityChange: function(eq, delta) that updates the quantity for this equipment
 * - formDisabled: boolean, true while the form is submitting (disables the +/- buttons)
 *
 * OUTPUT (return value):
 * - JSX: a single row showing the equipment name, its min/available info,
 *   and the +/- buttons to change its selected quantity
 */
function renderEquipmentRow(
	eq,
	quantities,
	handleQuantityChange,
	formDisabled,
) {
	// ---- Decide whether to show the "min X" badge ----
	// Only mandatory equipment (minQuantity > 0) shows this badge.
	let minBadge = null;
	if (eq.minQuantity > 0) {
		minBadge = (
			<Badge bg="warning" className="me-3">
				min: {eq.minQuantity}
			</Badge>
		);
	}

	return (
		<Row key={eq.id} className="justify-content-between mb-2">
			{/* Left side: just the equipment name (+ the "min X" badge, if mandatory) */}
			<Col>{formatName(eq.name)}</Col>

			{/* Right side: availability badge + the +/- quantity controls, grouped together */}
			<Col xs="auto" className="d-flex align-items-center">
				{minBadge}
				<Badge className="me-3">available: {eq.availableQuantity}</Badge>

				<Button
					size="sm"
					variant="outline-secondary"
					type="button"
					disabled={formDisabled}
					// clicking "-" decreases the quantity of THIS equipment by 1
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
					// clicking "+" increases the quantity of THIS equipment by 1
					onClick={() => handleQuantityChange(eq, 1)}
				>
					+
				</Button>
			</Col>
		</Row>
	);
}

/**
 * renderEquipmentSelection
 *
 * INPUT (params, passed as a single object):
 * - equipmentRules: array of equipment objects for the selected facility type
 * - quantities: object mapping equipment id -> currently selected quantity
 * - handleQuantityChange: function(eq, delta) used to update a quantity
 * - formDisabled: boolean, true while the form is submitting
 *
 * OUTPUT (return value):
 * - JSX: a <Card> with two sections, "Mandatory" and "Optional" equipment rows
 */
function renderEquipmentSelection({
	equipmentRules,
	quantities,
	handleQuantityChange,
	formDisabled,
}) {
	// Split the full list into two groups: mandatory (minQuantity > 0) and optional.
	const mandatory = equipmentRules.filter((eq) => eq.minQuantity > 0);
	const optional = equipmentRules.filter((eq) => eq.minQuantity === 0);

	// ---- Decide what to show in the "Mandatory" section ----
	let mandatoryContent;
	if (mandatory.length === 0) {
		mandatoryContent = <p className="text-muted">—</p>;
	} else {
		mandatoryContent = mandatory.map((eq) =>
			renderEquipmentRow(eq, quantities, handleQuantityChange, formDisabled),
		);
	}

	// ---- Decide what to show in the "Optional" section ----
	let optionalContent;
	if (optional.length === 0) {
		optionalContent = <p className="text-muted">—</p>;
	} else {
		optionalContent = optional.map((eq) =>
			renderEquipmentRow(eq, quantities, handleQuantityChange, formDisabled),
		);
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

/**
 * buildInitialQuantities
 *
 * INPUT (params, positional):
 * - rules: array of equipment objects, e.g. [{ id, minQuantity, availableQuantity }, ...]
 *
 * OUTPUT (return value):
 * - object mapping equipment id -> starting quantity
 *   (mandatory items start at their minimum required quantity, optional items start at 0)
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

// -----------------------------------------------------------------------------
// MAIN COMPONENT
// -----------------------------------------------------------------------------

/**
 * Book
 *
 * INPUT: none (this is a page-level component, it takes no props)
 *
 * OUTPUT (return value):
 * - JSX: the full "New reservation" page, including the facility card,
 *   the equipment card (once a type is selected), and the submit button
 */
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

	/**
	 * handleServerError
	 *
	 * INPUT (params, positional):
	 * - err: whatever the failed API call rejected with. It can be:
	 *     - an object with an "error" property (e.g. { error: "message" })
	 *     - a plain string
	 *     - something else / unknown
	 *
	 * OUTPUT (return value):
	 * - none (undefined). Its job is a SIDE EFFECT: it updates the errorMsg state,
	 *   which then makes the <Alert> at the top of the page appear.
	 */
	const handleServerError = (err) => {
		let msg = "";
		if (err.error) msg = err.error;
		else if (typeof err === "string") msg = String(err);
		else msg = "Unknown Error";
		setErrorMsg(msg);
	};

	// ---- Effect 1: load the list of facility types once, when the page mounts ----
	// Empty dependency array [] means: run only once, right after the first render.
	useEffect(() => {
		API.getFacilityTypes()
			.then((types) => setFacilityTypes(types))
			.catch((err) => handleServerError(err));
	}, []);

	// ---- Effect 2: react to a change of the selected facility type ----
	// Runs again every time "selectedTypeId" changes (including the very first time
	// it goes from "" to a real id). All the actions below are consequences of the
	// SAME event ("the user picked a different facility type"), so they live together
	// in a single effect instead of being split into several effects with the
	// same dependency.
	useEffect(() => {
		// Reset choices that no longer make sense for the new type.
		setSelectedFacilityCode("");
		setErrorMsg("");

		// If no type is selected (e.g. user reset the dropdown), clear everything
		// and stop here: there is nothing to fetch from the server.
		if (!selectedTypeId) {
			setFreeFacilities([]);
			setEquipmentRules([]);
			setQuantities({});
			return;
		}

		// Fetch the free facilities of the selected type.
		API.getFacilities("free")
			.then((facilities) => {
				const filtered = facilities.filter(
					(f) => f.facilityTypeId === Number(selectedTypeId),
				);
				setFreeFacilities(filtered);
			})
			.catch((err) => handleServerError(err));

		// Fetch the equipment rules for the selected type, and initialize
		// the quantities state accordingly (mandatory items pre-filled).
		API.getEquipment(Number(selectedTypeId))
			.then((rules) => {
				setEquipmentRules(rules);
				setQuantities(buildInitialQuantities(rules));
			})
			.catch((err) => handleServerError(err));
	}, [selectedTypeId]);

	/**
	 * handleQuantityChange
	 *
	 * INPUT (params, positional):
	 * - eq: the equipment object whose quantity is being changed
	 *   (must have id, minQuantity, availableQuantity)
	 * - delta: number, how much to add to the current quantity (+1 or -1)
	 *
	 * OUTPUT (return value):
	 * - none (undefined). Its job is a SIDE EFFECT: it updates the "quantities" state,
	 *   clamped between eq.minQuantity and eq.availableQuantity.
	 */
	const handleQuantityChange = (eq, delta) => {
		setQuantities((prev) => {
			// prev = the quantities object as it is right now, before this update
			// example: { 1: 2, 2: 0, 3: 1 }

			// current = how many units of THIS equipment are selected right now
			const current = prev[eq.id];

			// next = the new proposed quantity (current + delta)
			let next = current + delta;

			// don't go below the minimum required quantity
			if (next < eq.minQuantity) next = eq.minQuantity;

			// don't go above the quantity available
			if (next > eq.availableQuantity) next = eq.availableQuantity;

			// create a copy of the whole object, so "prev" itself is never modified
			// (React state must always be treated as immutable)
			const updated = { ...prev };

			// update only the quantity for THIS equipment inside the copy
			updated[eq.id] = next;

			// return the updated copy: this becomes the new state
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
	 * - none (undefined). Its job is a SIDE EFFECT: it validates the form,
	 *   builds the reservation object, and sends it to the server.
	 */
	const handleSubmit = (event) => {
		// Prevent the browser's default behavior (a full page reload on submit).
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

		// Keep only equipment with a quantity greater than 0,
		// and reshape each entry into { equipmentId, quantity }.
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

	// ---- Decide whether to show the error alert ----
	let errorAlert = null;
	if (errorMsg) {
		errorAlert = (
			<Alert variant="danger" dismissible onClose={() => setErrorMsg("")}>
				{errorMsg}
			</Alert>
		);
	}

	// ---- Decide whether to show the equipment card ----
	// It only makes sense once a facility type has been selected.
	let equipmentCard = null;
	if (selectedTypeId) {
		equipmentCard = renderEquipmentSelection({
			equipmentRules,
			quantities,
			handleQuantityChange,
			formDisabled,
		});
	}

	// ---- Decide the label shown on the submit button ----
	let submitLabel;
	if (formDisabled) {
		submitLabel = "Saving...";
	} else {
		submitLabel = "Confirm reservation";
	}

	return (
		<Container fluid className="py-4">
			<h1 className="mb-4">New reservation</h1>

			{errorAlert}

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

				{equipmentCard}

				<Button
					type="submit"
					variant="success"
					disabled={!selectedTypeId || formDisabled}
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
