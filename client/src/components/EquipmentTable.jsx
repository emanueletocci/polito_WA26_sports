import { Table, Badge } from "react-bootstrap";

import { formatName } from "../utils.js";

/**
 * EquipmentStockRow
 *
 * One row of the availability table of the public homepage. It is named after
 * the STOCK it shows, so that it is never confused with the EquipmentRow of
 * EquipmentRow.jsx, which is the editable line with the +/- controls.
 *
 * INPUT (props, passed as a single object):
 * - equipment: one equipment object
 *   { id, name, facilityTypeName, availableQuantity, totalQuantity }
 *
 * OUTPUT (return value):
 * - JSX: one <tr> describing this equipment, with a coloured badge showing
 *   whether it can still be rented
 */
function EquipmentStockRow(props) {
	const equipment = props.equipment;

	// getStockStatus is called only ONCE per row, and its result is stored.
	const status = getStockStatus(equipment.availableQuantity);

	return (
		<tr>
			<td>{formatName(equipment.name)}</td>
			<td>{formatName(equipment.facilityTypeName)}</td>
			<td>{equipment.availableQuantity}</td>
			<td>{equipment.totalQuantity}</td>
			<td>
				<Badge bg={status.color}>{status.label}</Badge>
			</td>
		</tr>
	);
}

/**
 * EquipmentTable
 *
 * INPUT (props, passed as a single object):
 * - equipmentList: array of equipment objects, each shaped like
 *   { id, name, facilityTypeName, availableQuantity, totalQuantity }
 *
 * OUTPUT (return value):
 * - JSX: a table with one row per equipment type, or a placeholder message when
 *   the list is empty (e.g. while it is still being loaded)
 */
function EquipmentTable(props) {
	// What to show when there is nothing to display is decided before the return.
	if (props.equipmentList.length === 0) {
		return <p className="text-muted">No equipment to show.</p>;
	}

	return (
		<Table bordered hover>
			<thead>
				<tr>
					<th>Equipment</th>
					<th>Facility type</th>
					<th>Available</th>
					<th>Total</th>
					<th>State</th>
				</tr>
			</thead>
			<tbody>
				{/* One row per equipment type */}
				{props.equipmentList.map((eq) => (
					<EquipmentStockRow key={eq.id} equipment={eq} />
				))}
			</tbody>
		</Table>
	);
}

/**
 * getStockStatus
 *
 * INPUT (params, positional):
 * - availableQuantity: number, how many units of this equipment are available
 *
 * OUTPUT (return value):
 * - object { color, label }:
 *   - color: string, the name of a react-bootstrap variant used as the
 *     background of the badge ("success" = green, "danger" = red)
 *   - label: string, the text shown inside the badge
 */
function getStockStatus(availableQuantity) {
	if (availableQuantity > 0) {
		return { color: "success", label: "Available" };
	}
	return { color: "danger", label: "Out of stock" };
}

export default EquipmentTable;
