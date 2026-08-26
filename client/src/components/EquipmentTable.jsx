import { Table, Badge } from "react-bootstrap";
import { formatName } from "../utils";

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
					{equipmentList.map((eq) => (
						<tr key={eq.id}>
							<td>{formatName(eq.name)}</td>
							<td>{formatName(eq.facilityTypeName)}</td>
							<td>{eq.availableQuantity}</td>
							<td>{eq.totalQuantity}</td>
							<td>
								<Badge bg={getStockStatus(eq.availableQuantity).color}>
									{getStockStatus(eq.availableQuantity).label}
								</Badge>
							</td>
						</tr>
					))}
				</tbody>
			</Table>
		</>
	);
}

{
	/* Returns the badge color and label describing whether this equipment is still available. */
}
function getStockStatus(availableQuantity) {
	if (availableQuantity > 0) {
		return { color: "success", label: "Available" };
	}
	return { color: "danger", label: "Out of stock" };
}

export default EquipmentTable;
