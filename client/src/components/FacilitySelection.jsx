import { Form, Card, Badge, ButtonGroup, ToggleButton } from "react-bootstrap";

import { formatName } from "../utils.js";

/**
 * FacilitySelection
 *
 * The "Facility" card of the reservation form. Like the equipment card, it is a
 * presentational component: it holds no state of its own and applies no rule,
 * every value and setter comes from Book.
 *
 * INPUT (props, passed as a single object):
 * - facilityTypes: array of facility type objects, e.g. [{ id, name }, ...]
 * - selectedTypeId: string, the id of the currently selected type ("" if none)
 * - setSelectedTypeId: state setter function, updates selectedTypeId
 * - mode: string, either "manual" or "automatic"
 * - setMode: state setter function, updates mode
 * - freeFacilities: array of free facility objects of the selected type,
 *   e.g. [{ code, facilityTypeId }, ...]
 * - selectedFacilityCode: string, the code of the selected facility ("" if none)
 * - setSelectedFacilityCode: state setter function, updates selectedFacilityCode
 * - formDisabled: boolean, true while the form is being submitted
 *
 * OUTPUT (return value):
 * - JSX: the "Facility" card of the form (type dropdown, manual/automatic
 *   selection mode, and the list of the free facilities of the chosen type)
 */
function FacilitySelection(props) {
	// ---- What to show in the list of free facilities ----
	// The content is computed here, with a standard if/else, instead of writing
	// a ternary inside the JSX.
	let freeFacilitiesContent;
	if (props.freeFacilities.length === 0) {
		freeFacilitiesContent = (
			<p className="text-muted mb-0">No free facilities of this type.</p>
		);
	} else {
		freeFacilitiesContent = props.freeFacilities.map((f) => (
			<Form.Check
				key={f.code}
				type="radio"
				name="facilityCode"
				id={"facility-" + f.code}
				// checked = this radio is selected only if its code matches the state
				checked={f.code === props.selectedFacilityCode}
				// onChange: the user picked THIS facility, save its code in the state
				onChange={() => props.setSelectedFacilityCode(f.code)}
				disabled={props.formDisabled}
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

	// ---- The list of facilities is shown only in "manual" mode ----
	let manualFacilityBlock = null;
	if (props.mode === "manual") {
		manualFacilityBlock = (
			<Form.Group className="mb-1">{freeFacilitiesContent}</Form.Group>
		);
	}

	// ---- Mode buttons and facility list appear only after a type is chosen ----
	let modeAndFacilityBlock = null;
	if (props.selectedTypeId) {
		modeAndFacilityBlock = (
			<>
				<ButtonGroup className="mb-3">
					<ToggleButton
						id="mode-manual"
						type="radio"
						variant="outline-primary"
						name="mode"
						value="manual"
						checked={props.mode === "manual"}
						onChange={() => props.setMode("manual")}
						disabled={props.formDisabled}
					>
						Manual selection
					</ToggleButton>
					<ToggleButton
						id="mode-automatic"
						type="radio"
						variant="outline-primary"
						name="mode"
						value="automatic"
						checked={props.mode === "automatic"}
						onChange={() => props.setMode("automatic")}
						disabled={props.formDisabled}
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
			<h2 className="h5">Facility</h2>
			<p className="text-muted small mb-3">
				Choose a sport type, then pick a specific facility or let the system
				assign one automatically.
			</p>

			<Form.Group className="mb-3">
				<Form.Label>Type</Form.Label>
				{/*
					- ev is a (synthetic) event object
					- ev.target represents the DOM element that generated the event
					  (here, the <select> element the user interacted with)
					- ev.target.value is the value of the <option> just selected
				*/}
				<Form.Select
					value={props.selectedTypeId}
					onChange={(ev) => props.setSelectedTypeId(ev.target.value)}
					disabled={props.formDisabled}
				>
					<option value="">-- Select a type --</option>
					{props.facilityTypes.map((ft) => (
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

export default FacilitySelection;
