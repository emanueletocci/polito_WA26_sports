import { Table, Badge } from "react-bootstrap";
import { formatName } from "../utils";

/**
 * EquipmentTable
 *
 * INPUT (props, passed as a single object):
 * - equipmentList: array of equipment objects, each shaped like:
 *   { id, name, facilityTypeName, availableQuantity, totalQuantity }
 *
 * OUTPUT (return value):
 * - JSX: a bordered, hoverable table listing every equipment item,
 *   one row per item, with a colored Badge showing its stock state
 */
function EquipmentTable({ equipmentList }) {
	return (
		<>
			<Table bordered hover>
				<thead>
					<tr>
						<th>Equipment</th>
						<th>Type</th>
						<th>Available</th>
						<th>Total</th>
						<th>State</th>
					</tr>
				</thead>
				<tbody>
					{/* One <tr> per equipment item in the list */}
					{equipmentList.map((eq) => {
						// Call getStockStatus only ONCE per row, and store the result
						let status = getStockStatus(eq.availableQuantity);

						return (
							<tr key={eq.id}>
								<td>{formatName(eq.name)}</td>
								<td>{formatName(eq.facilityTypeName)}</td>
								<td>{eq.availableQuantity}</td>
								<td>{eq.totalQuantity}</td>
								<td>
									<Badge bg={status.color}>{status.label}</Badge>
								</td>
							</tr>
						);
					})}
				</tbody>
			</Table>
		</>
	);
}

/**
 * getStockStatus
 *
 * INPUT:
 * - availableQuantity: number, how many units of this equipment are currently available
 *
 * OUTPUT (return value):
 * - object { color, label }:
 *   - color: string, a react-bootstrap variant name used for the Badge background
 *     ("success" = green, "danger" = red)
 *   - label: string, the text displayed inside the Badge ("Available" or "Out of stock")
 */
function getStockStatus(availableQuantity) {
	if (availableQuantity > 0) {
		return { color: "success", label: "Available" };
	}
	return { color: "danger", label: "Out of stock" };
}

export default EquipmentTable;
